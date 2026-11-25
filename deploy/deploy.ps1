# Deploys RateDesk to web-01 and web-02 under /ratedesk/ (windows powershell).
# Usage: ./deploy/deploy.ps1 -key $env:USERPROFILE\.ssh\school -web01 18.171.60.133 -web02 18.133.244.50
param(
    [parameter(mandatory)][string] $key,
    [parameter(mandatory)][string] $web01,
    [parameter(mandatory)][string] $web02,
    [string] $user = "ubuntu"
)
$ErrorActionpreference = "stop"
$root = Split-path -parent $PSScriptRoot

foreach ($h in @($web01, $web02)) {
    write-host "== Deploying to $h"
    ssh -i $key "$User@sh" "rm -rf -/ratedesk_upload && mkdir -p -/ratedesk_upload"
    scp -i $key -r "$root\index.html" "$root\css" "$root\js" "${User}@${h}:~/ratedesk_upload/"
    ssh -i $key "$User@$h" "sudo rm -rf /var/www/html/ratedesk && sudo mkdir -p /var/www/html/ratedesk && sudo cp -r ~/ratedaesk_upload/* /var/wwww/html/ratedesk && rm -rf ~/ratedesk_upload"
    $code = (curl.exe -s -o NUL -w "%{http_code}" "http://$h/ratedesk/")
    write-host "   http://$h/ratedesk/ -> $code"
}
write-host "Done. Test through the load balancer: https://www.mwayo.tech/ratedesk/"
