# ============================================================
# cleanup-manual.ps1 - Limpieza manual sin Terraform
# Para usar cuando el backend S3 de Terraform no es accesible
# Uso: .\scripts\cleanup-manual.ps1
# ============================================================

$ErrorActionPreference = "Continue"
$PROJECT = "tpv"
$REGION  = "us-east-1"

function Write-Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Yellow }
function Write-Info($msg) { Write-Host "   $msg" -ForegroundColor Gray }
function Write-Ok($msg)   { Write-Host "   OK: $msg" -ForegroundColor Green }

Write-Host ""
Write-Host "  LIMPIEZA MANUAL DE RECURSOS AWS - $($PROJECT.ToUpper())" -ForegroundColor Cyan

# ── VPC ID ──────────────────────────────────────────────────
$vpcId = aws ec2 describe-vpcs --filters "Name=tag:Name,Values=$PROJECT-vpc" `
    --query "Vpcs[0].VpcId" --output text 2>$null
if ($vpcId -and $vpcId -ne "None") {
    Write-Info "VPC encontrada: $vpcId"
} else {
    Write-Info "VPC no encontrada."
    $vpcId = $null
}

# ── 1. RDS ───────────────────────────────────────────────────
Write-Step "Eliminando RDS instance '$PROJECT-db'..."
$rdsStatus = aws rds describe-db-instances --db-instance-identifier "$PROJECT-db" `
    --query "DBInstances[0].DBInstanceStatus" --output text 2>$null
if ($rdsStatus -and $rdsStatus -ne "None") {
    Write-Info "RDS en estado: $rdsStatus. Eliminando..."
    aws rds delete-db-instance `
        --db-instance-identifier "$PROJECT-db" `
        --skip-final-snapshot 2>$null | Out-Null
    Write-Info "Esperando a que RDS termine de eliminarse (puede tardar 3-5 min)..."
    aws rds wait db-instance-deleted --db-instance-identifier "$PROJECT-db"
    Write-Ok "RDS eliminado."
} else {
    Write-Info "RDS no existe o ya eliminado."
}

Write-Step "Eliminando DB Subnet Group '$PROJECT-db-subnet-group'..."
aws rds delete-db-subnet-group --db-subnet-group-name "$PROJECT-db-subnet-group" 2>$null | Out-Null
Write-Ok "DB Subnet Group eliminado (o no existia)."

Write-Step "Eliminando Secret '$PROJECT/db-credentials'..."
aws secretsmanager delete-secret `
    --secret-id "$PROJECT/db-credentials" `
    --force-delete-without-recovery 2>$null | Out-Null
Write-Ok "Secret eliminado (o no existia)."

# ── 2. ECR ───────────────────────────────────────────────────
Write-Step "Eliminando repositorio ECR '$PROJECT'..."
$ecrExists = aws ecr describe-repositories --repository-names $PROJECT `
    --query "repositories[0].repositoryName" --output text 2>$null
if ($ecrExists -eq $PROJECT) {
    $imgs = aws ecr list-images --repository-name $PROJECT `
        --query "imageIds[*]" --output json 2>$null
    if ($imgs -and $imgs -ne "[]") {
        aws ecr batch-delete-image --repository-name $PROJECT `
            --image-ids $imgs 2>$null | Out-Null
    }
    aws ecr delete-repository --repository-name $PROJECT --force 2>$null | Out-Null
    Write-Ok "ECR eliminado."
} else {
    Write-Info "ECR no existe o ya eliminado."
}

# ── 3. Security Groups huerfanos ─────────────────────────────
if ($vpcId) {
    Write-Step "Eliminando Security Groups de la VPC..."
    $sgs = aws ec2 describe-security-groups `
        --filters "Name=vpc-id,Values=$vpcId" `
        --query "SecurityGroups[?GroupName!='default'].GroupId" --output text 2>$null
    foreach ($sg in (($sgs -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
        aws ec2 delete-security-group --group-id $sg 2>$null | Out-Null
        Write-Info "SG $sg eliminado."
    }
}

# ── 4. EIPs ─────────────────────────────────────────────────
Write-Step "Liberando Elastic IPs..."
$eips = aws ec2 describe-addresses --filters "Name=domain,Values=vpc" `
    --query "Addresses[*].AllocationId" --output text 2>$null
foreach ($a in (($eips -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
    $assoc = aws ec2 describe-addresses --allocation-ids $a `
        --query "Addresses[0].AssociationId" --output text 2>$null
    if ($assoc -and $assoc -ne "None") {
        aws ec2 disassociate-address --association-id $assoc 2>$null | Out-Null
    }
    aws ec2 release-address --allocation-id $a 2>$null | Out-Null
    Write-Info "EIP $a liberada."
}

# ── 5. ENIs ─────────────────────────────────────────────────
if ($vpcId) {
    Write-Step "Eliminando ENIs disponibles en la VPC..."
    for ($i = 1; $i -le 4; $i++) {
        $enis = aws ec2 describe-network-interfaces `
            --filters "Name=vpc-id,Values=$vpcId" "Name=status,Values=available" `
            --query "NetworkInterfaces[*].NetworkInterfaceId" --output text 2>$null
        $eniList = ($enis -split "`t") | Where-Object { $_ -and $_ -ne "None" }
        if ($eniList.Count -eq 0) { break }
        foreach ($e in $eniList) {
            aws ec2 delete-network-interface --network-interface-id $e 2>$null | Out-Null
            Write-Info "ENI $e eliminado."
        }
        Start-Sleep -Seconds 10
    }
}

# ── 6. VPC ───────────────────────────────────────────────────
if ($vpcId) {
    Write-Step "Comprobando ENIs in-use antes de eliminar VPC..."
    $inUse = aws ec2 describe-network-interfaces `
        --filters "Name=vpc-id,Values=$vpcId" "Name=status,Values=in-use" `
        --query "NetworkInterfaces[*].{ID:NetworkInterfaceId,Desc:Description,PublicIP:Association.PublicIp}" `
        --output table 2>$null
    if ($inUse -and $inUse -notmatch "None") {
        Write-Host "   ENIs aun en uso:" -ForegroundColor DarkYellow
        Write-Host $inUse -ForegroundColor DarkYellow
        Write-Host "   Esperando 30s mas..." -ForegroundColor Gray
        Start-Sleep -Seconds 30
    }

    Write-Step "Eliminando Route Table Associations..."
    $rtbs = aws ec2 describe-route-tables `
        --filters "Name=vpc-id,Values=$vpcId" `
        --query "RouteTables[?Associations[0].Main!=``true``].RouteTableId" --output text 2>$null
    foreach ($rtb in (($rtbs -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
        $assocIds = aws ec2 describe-route-tables --route-table-ids $rtb `
            --query "RouteTables[0].Associations[?Main!=``true``].RouteTableAssociationId" `
            --output text 2>$null
        foreach ($assocId in (($assocIds -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
            aws ec2 disassociate-route-table --association-id $assocId 2>$null | Out-Null
        }
        aws ec2 delete-route-table --route-table-id $rtb 2>$null | Out-Null
        Write-Info "Route table $rtb eliminada."
    }

    Write-Step "Eliminando Subnets..."
    $subnets = aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpcId" `
        --query "Subnets[*].SubnetId" --output text 2>$null
    foreach ($s in (($subnets -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
        aws ec2 delete-subnet --subnet-id $s 2>$null | Out-Null
        Write-Info "Subnet $s eliminada."
    }

    Write-Step "Desconectando y eliminando Internet Gateway..."
    $igws = aws ec2 describe-internet-gateways `
        --filters "Name=attachment.vpc-id,Values=$vpcId" `
        --query "InternetGateways[*].InternetGatewayId" --output text 2>$null
    foreach ($igw in (($igws -split "`t") | Where-Object { $_ -and $_ -ne "None" })) {
        aws ec2 detach-internet-gateway --internet-gateway-id $igw --vpc-id $vpcId 2>$null | Out-Null
        aws ec2 delete-internet-gateway --internet-gateway-id $igw 2>$null | Out-Null
        Write-Info "IGW $igw eliminado."
    }

    Write-Step "Eliminando VPC $vpcId..."
    aws ec2 delete-vpc --vpc-id $vpcId 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "VPC $vpcId eliminada correctamente."
    } else {
        Write-Host "   ERROR eliminando VPC. Verifica la consola AWS." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "== Limpieza completada." -ForegroundColor Green
Write-Host "== S3 media y tfstate se conservan." -ForegroundColor Gray
Write-Host "== Para redesplegar: actualiza credenciales, terraform apply, deploy.ps1" -ForegroundColor Gray
