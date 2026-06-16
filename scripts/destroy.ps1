# ============================================================
# destroy.ps1 - Destruye toda la infraestructura AWS (excepto S3)
# Uso: .\scripts\destroy.ps1  (desde cualquier directorio)
# ============================================================

$ErrorActionPreference = "Continue"

# Asegurar que trabajamos desde la raiz del proyecto
Set-Location $PSScriptRoot\..

# ── Constantes (deben coincidir con variables.tf) ────────────
$PROJECT   = "tpv"
$REGION    = "us-east-1"
$CLUSTER   = "$PROJECT-cluster"
$NODEGROUP = "$PROJECT-nodes"
$ECR_NAME  = $PROJECT
$VPC_TAG   = "$PROJECT-vpc"

function Write-Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "== [$n/$total] $msg" -ForegroundColor Yellow
}
function Write-Info($msg) { Write-Host "   $msg" -ForegroundColor Gray }
function Write-Ok($msg)   { Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   WARN: $msg" -ForegroundColor DarkYellow }

# Limpia ENIs disponibles, EIPs y SGs huerfanos de la VPC
function Remove-VpcResiduals($vpcId) {
    if (-not $vpcId -or $vpcId -eq "None") { return }

    $eips = aws ec2 describe-addresses --region $REGION `
        --filters "Name=domain,Values=vpc" `
        --query "Addresses[*].AllocationId" --output text 2>$null
    foreach ($a in (($eips -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
        $assoc = aws ec2 describe-addresses --region $REGION --allocation-ids $a `
            --query "Addresses[0].AssociationId" --output text 2>$null
        if ($assoc -and $assoc -ne "None") {
            aws ec2 disassociate-address --region $REGION --association-id $assoc 2>$null | Out-Null
        }
        aws ec2 release-address --region $REGION --allocation-id $a 2>$null | Out-Null
        Write-Info "EIP liberada: $a"
    }

    $enis = aws ec2 describe-network-interfaces --region $REGION `
        --filters "Name=vpc-id,Values=$vpcId" "Name=status,Values=available" `
        --query "NetworkInterfaces[*].NetworkInterfaceId" --output text 2>$null
    foreach ($e in (($enis -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
        aws ec2 delete-network-interface --region $REGION --network-interface-id $e 2>$null | Out-Null
        Write-Info "ENI eliminado: $e"
    }

    $sgs = aws ec2 describe-security-groups --region $REGION `
        --filters "Name=vpc-id,Values=$vpcId" `
        --query "SecurityGroups[?GroupName!='default'].GroupId" --output text 2>$null
    foreach ($sg in (($sgs -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
        aws ec2 delete-security-group --region $REGION --group-id $sg 2>$null | Out-Null
    }
}

# Espera polling hasta que no haya ENIs in-use en la VPC
function Wait-ENIsCleared($vpcId) {
    if (-not $vpcId -or $vpcId -eq "None") { return }
    $maxWait = 300; $elapsed = 0
    do {
        Remove-VpcResiduals -vpcId $vpcId
        $inUse = aws ec2 describe-network-interfaces --region $REGION `
            --filters "Name=vpc-id,Values=$vpcId" "Name=status,Values=in-use" `
            --query "NetworkInterfaces[*].NetworkInterfaceId" --output text 2>$null
        $inUse = ($inUse -split "`t") | Where-Object { $_ -and $_ -ne "None" }
        if ($inUse.Count -eq 0) { Write-Ok "No quedan ENIs en la VPC."; return }
        Write-Info "$($inUse.Count) ENI(s) aun en uso, esperando... ($elapsed s)"
        Start-Sleep -Seconds 20; $elapsed += 20
    } while ($elapsed -lt $maxWait)
    Write-Warn "Timeout esperando ENIs. Terraform intentara igualmente."
}

# ════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  DESTRUCCION DE INFRAESTRUCTURA - $($PROJECT.ToUpper())" -ForegroundColor Cyan
Write-Host "  Region: $REGION  |  Cluster: $CLUSTER" -ForegroundColor Cyan

# VPC ID - necesario desde el principio (--region obligatorio)
$vpcId = aws ec2 describe-vpcs --region $REGION `
    --filters "Name=tag:Name,Values=$VPC_TAG" `
    --query "Vpcs[0].VpcId" --output text 2>$null
if ($vpcId -and $vpcId -ne "None") {
    Write-Info "VPC encontrada: $vpcId"
} else {
    Write-Warn "VPC '$VPC_TAG' no encontrada. Puede que ya este destruida."
    $vpcId = $null
}

# ── 1. Eliminar recursos de Kubernetes ──────────────────────
Write-Step 1 8 "Eliminando recursos de Kubernetes..."
kubectl delete -f k8s/deployment.yaml --ignore-not-found 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Info "Cluster no disponible o recursos k8s ya eliminados."
}
Write-Info "Esperando 30s para que el cloud-controller procese la eliminacion del NLB..."
Start-Sleep -Seconds 30

# ── 2. Eliminar Load Balancers y esperar que desaparezcan ───
Write-Step 2 8 "Eliminando Load Balancers (NLB/ALB/ELB)..."
$lbArns = aws elbv2 describe-load-balancers --region $REGION `
    --query "LoadBalancers[*].LoadBalancerArn" --output text 2>$null
foreach ($arn in (($lbArns -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
    aws elbv2 delete-load-balancer --region $REGION --load-balancer-arn $arn 2>$null | Out-Null
    Write-Info "NLB/ALB eliminado: $arn"
}
$classicLbs = aws elb describe-load-balancers --region $REGION `
    --query "LoadBalancerDescriptions[*].LoadBalancerName" --output text 2>$null
foreach ($lb in (($classicLbs -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
    aws elb delete-load-balancer --region $REGION --load-balancer-name $lb 2>$null | Out-Null
    Write-Info "ELB clasico eliminado: $lb"
}
$maxWait = 300; $elapsed = 0
do {
    $remaining = aws elbv2 describe-load-balancers --region $REGION `
        --query "length(LoadBalancers)" --output text 2>$null
    if ($remaining -eq "0" -or -not $remaining) { Write-Ok "No quedan LBs."; break }
    Write-Info "Todavia hay $remaining LB(s), esperando... ($elapsed s)"
    Start-Sleep -Seconds 15; $elapsed += 15
} while ($elapsed -lt $maxWait)

# ── 3. Vaciar ECR ────────────────────────────────────────────
Write-Step 3 8 "Vaciando repositorio ECR '$ECR_NAME'..."
$exists = aws ecr describe-repositories --region $REGION `
    --repository-names $ECR_NAME `
    --query "repositories[0].repositoryName" --output text 2>$null
if ($exists -eq $ECR_NAME) {
    $imgs = aws ecr list-images --region $REGION --repository-name $ECR_NAME `
        --query "imageIds[*]" --output json 2>$null
    if ($imgs -and $imgs -ne "[]") {
        aws ecr batch-delete-image --region $REGION --repository-name $ECR_NAME `
            --image-ids $imgs 2>$null | Out-Null
        Write-Ok "Imagenes ECR eliminadas."
    } else { Write-Info "ECR ya estaba vacio." }
} else { Write-Info "ECR no existe o ya eliminado." }

# ── 4. Eliminar EKS Node Group via CLI + WAIT ───────────────
Write-Step 4 8 "Eliminando EKS Node Group '$NODEGROUP'..."
$ngExists = aws eks describe-nodegroup --region $REGION `
    --cluster-name $CLUSTER --nodegroup-name $NODEGROUP `
    --query "nodegroup.status" --output text 2>$null
if ($ngExists -and $ngExists -ne "None") {
    aws eks delete-nodegroup --region $REGION `
        --cluster-name $CLUSTER --nodegroup-name $NODEGROUP 2>$null | Out-Null
    Write-Info "Esperando que las instancias EC2 terminen completamente..."
    aws eks wait nodegroup-deleted --region $REGION `
        --cluster-name $CLUSTER --nodegroup-name $NODEGROUP
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Node group eliminado. Instancias terminadas."
    } else {
        Write-Warn "Timeout en wait nodegroup-deleted."
    }
} else {
    Write-Info "Node group no existe o ya eliminado."
}

# ── 5. Eliminar EKS Cluster via CLI + WAIT ──────────────────
Write-Step 5 8 "Eliminando EKS Cluster '$CLUSTER'..."
$clusterExists = aws eks describe-cluster --region $REGION `
    --name $CLUSTER --query "cluster.status" --output text 2>$null
if ($clusterExists -and $clusterExists -ne "None") {
    aws eks delete-cluster --region $REGION --name $CLUSTER 2>$null | Out-Null
    Write-Info "Esperando que el cluster y sus ENIs de control plane se liberen..."
    aws eks wait cluster-deleted --region $REGION --name $CLUSTER
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Cluster EKS eliminado."
    } else {
        Write-Warn "Timeout en wait cluster-deleted."
    }
} else {
    Write-Info "Cluster EKS no existe o ya eliminado."
}

# ── 6. Limpiar ENIs, EIPs y SGs residuales ──────────────────
Write-Step 6 8 "Limpiando ENIs, EIPs y Security Groups residuales de la VPC..."
Wait-ENIsCleared -vpcId $vpcId

# ── 7. Terraform: EKS (sync estado) + RDS + ECR ─────────────
Write-Step 7 8 "Terraform: destruyendo RDS y ECR (sincronizando estado EKS)..."
Set-Location $PSScriptRoot\..\infra
terraform destroy -auto-approve `
    -target "module.eks" `
    -target "module.rds" `
    -target "module.ecr"
$tf1Result = $LASTEXITCODE
Set-Location $PSScriptRoot
if ($tf1Result -ne 0) {
    Write-Warn "Terraform FASE1 con codigo $tf1Result. Continuando con VPC..."
} else {
    Write-Ok "Terraform FASE1 completado."
}

# Segunda limpieza post-Terraform
Remove-VpcResiduals -vpcId $vpcId

# ── 8. Terraform: VPC ────────────────────────────────────────
Write-Step 8 8 "Terraform: destruyendo VPC..."
Set-Location $PSScriptRoot\..\infra
terraform destroy -auto-approve -target "module.vpc"
$tf2Result = $LASTEXITCODE
Set-Location $PSScriptRoot

Write-Host ""
if ($tf1Result -eq 0 -and $tf2Result -eq 0) {
    Write-Host "== Infraestructura destruida correctamente." -ForegroundColor Green
    Write-Host "== S3 conservado. Para redesplegar: terraform apply && .\scripts\deploy.ps1" -ForegroundColor Green
} else {
    Write-Host "== Destroy con errores (FASE1=$tf1Result, FASE2=$tf2Result)." -ForegroundColor Red
    Write-Host "== Consola AWS VPC: https://console.aws.amazon.com/vpc/home?region=$REGION#vpcs:" -ForegroundColor Red
}
