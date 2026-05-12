param(
  [Parameter(Mandatory=$true)]
  [string]$Image,

  [string]$Version = "v0.1.0",
  [switch]$Push
)

$ErrorActionPreference = "Stop"

$tag = "${Image}:${Version}"
$latest = "${Image}:latest"

Write-Host "Building $tag"
docker build --platform linux/amd64 -f workers/runpod-blender/Dockerfile -t $tag -t $latest .

if ($Push) {
  Write-Host "Pushing $tag"
  docker push $tag
  Write-Host "Pushing $latest"
  docker push $latest
}

Write-Host ""
Write-Host "Image ready: $tag"
Write-Host "Create RunPod endpoint:"
Write-Host "python scripts/create_runpod_endpoint.py --image $tag"

