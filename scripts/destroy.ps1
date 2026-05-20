# ============================================================
# destroy.ps1 - Destruye toda la infraestructura AWS
# Uso: .\scripts\destroy.ps1
# ============================================================

$ErrorActionPreference = "Continue"

Write-Host "== [1/4] Eliminando recursos de Kubernetes..." -ForegroundColor Yellow
kubectl delete -f k8s/deployment.yaml --ignore-not-found 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Cluster no disponible o recursos ya eliminados, continuando..." -ForegroundColor Gray
}

Write-Host "== [2/4] Esperando a que el Load Balancer se elimine completamente..." -ForegroundColor Yellow
$maxWait = 300
$elapsed = 0
do {
    $lb = aws elb describe-load-balancers --query "LoadBalancerDescriptions[*].LoadBalancerName" --output text 2>$null
    if ($lb) {
        Write-Host "   Load Balancer todavia activo, esperando..." -ForegroundColor Gray
        Start-Sleep -Seconds 15
        $elapsed += 15
    }
} while ($lb -and $elapsed -lt $maxWait)

if ($lb) {
    Write-Host "   Eliminando Load Balancer manualmente..." -ForegroundColor Yellow
    aws elb delete-load-balancer --load-balancer-name $lb
    Start-Sleep -Seconds 30
}

Write-Host "== [3/4] Eliminando security groups huerfanos..." -ForegroundColor Yellow
$vpcId = aws ec2 describe-vpcs --filters "Name=tag:Name,Values=tpv-vpc" --query "Vpcs[0].VpcId" --output text 2>$null
if ($vpcId -and $vpcId -ne "None") {
    $sgs = aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$vpcId" "Name=group-name,Values=k8s-elb-*" --query "SecurityGroups[*].GroupId" --output text 2>$null
    foreach ($sg in $sgs -split "`t") {
        if ($sg) {
            aws ec2 delete-security-group --group-id $sg 2>$null
            Write-Host "   Security group $sg eliminado" -ForegroundColor Gray
        }
    }
}

Write-Host "== [4/6] Eliminando repositorio ECR..." -ForegroundColor Yellow
aws ecr delete-repository --repository-name tpv --force 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ECR eliminado" -ForegroundColor Gray
} else {
    Write-Host "   ECR ya estaba eliminado o no existe, continuando..." -ForegroundColor Gray
}

Write-Host "== [5/6] Bucket S3 de datos (backups/logs/informes) se conserva entre sesiones." -ForegroundColor Gray

Write-Host "== [6/6] Destruyendo infraestructura Terraform (excepto S3)..." -ForegroundColor Yellow
Set-Location infra
terraform destroy -auto-approve `
    -target "module.eks" `
    -target "module.rds" `
    -target "module.ecr" `
    -target "module.vpc"
Set-Location ..

Write-Host ""
Write-Host "== Infraestructura destruida correctamente." -ForegroundColor Green
Write-Host "== Para volver a desplegar: terraform apply + .\scripts\deploy.ps1" -ForegroundColor Green