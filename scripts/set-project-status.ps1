[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$IssueNumber,

    [Parameter(Mandatory = $true)]
    [ValidateSet('Todo', '進行中', 'レビュー', '完了')]
    [string]$Status,

    [string]$Owner = 'EU0207',
    [string]$Repository = 'EU0207/concert-reception-system',
    [string]$ProjectTitle = 'コンサート受付システム開発'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$GitHubApiVersion = '2026-03-10'

function Invoke-GhJson {
    param([Parameter(Mandatory = $true)][string[]]$GhArguments)

    $output = & gh @GhArguments
    if ($LASTEXITCODE -ne 0) {
        throw "gh command failed: gh $($GhArguments -join ' ')"
    }

    return ($output | Out-String | ConvertFrom-Json)
}

function Invoke-GhRestJson {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$ApiArguments
    )

    $ghArguments = @(
        'api',
        '-H', "X-GitHub-Api-Version: $GitHubApiVersion"
    ) + $ApiArguments

    return Invoke-GhJson -GhArguments $ghArguments
}

function Invoke-GhRestPages {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Endpoint
    )

    $pages = Invoke-GhRestJson -ApiArguments @('--paginate', '--slurp', $Endpoint)
    return @(
        foreach ($page in @($pages)) {
            foreach ($entry in @($page)) {
                $entry
            }
        }
    )
}

$ownerData = Invoke-GhRestJson -ApiArguments @("users/$Owner")
$projectOwnerPath = switch ($ownerData.type) {
    'User' { "users/$Owner" }
    'Organization' { "orgs/$Owner" }
    default { throw "Unsupported GitHub Project owner type: $($ownerData.type)" }
}

$projectData = Invoke-GhRestPages -Endpoint "$projectOwnerPath/projectsV2?per_page=100"
$project = @($projectData) |
    Where-Object { $_.title -eq $ProjectTitle -and $_.state -eq 'open' } |
    Select-Object -First 1

if ($null -eq $project) {
    throw "Open project not found: $ProjectTitle"
}

$fieldData = Invoke-GhRestPages -Endpoint "$projectOwnerPath/projectsV2/$($project.number)/fields?per_page=100"
$statusField = @($fieldData) |
    Where-Object { $_.name -eq 'Status' -and $_.data_type -eq 'single_select' } |
    Select-Object -First 1

if ($null -eq $statusField) {
    throw 'Project Status field not found.'
}

$statusOption = @($statusField.options) |
    Where-Object { $_.name.raw -eq $Status } |
    Select-Object -First 1

if ($null -eq $statusOption) {
    throw "Project status option not found: $Status"
}

$issueData = Invoke-GhRestJson -ApiArguments @("repos/$Repository/issues/$IssueNumber")

if ($Status -eq '完了' -and $issueData.state -ne 'closed') {
    throw "Issue must be CLOSED before setting Project status to 完了: Issue #$IssueNumber"
}

if ($Status -ne '完了' -and $issueData.state -eq 'closed') {
    throw "Closed Issue must use Project status 完了: Issue #$IssueNumber"
}

function Get-ProjectItem {
    $itemData = Invoke-GhRestPages -Endpoint (
        "$projectOwnerPath/projectsV2/$($project.number)/items" +
        "?per_page=100&fields=$($statusField.id)"
    )

    return @($itemData) |
        Where-Object {
            $_.content_type -eq 'Issue' -and
            $_.content.number -eq $IssueNumber -and
            $_.content.repository.full_name -eq $Repository
        } |
        Select-Object -First 1
}

$item = Get-ProjectItem
if ($null -eq $item) {
    $addedItem = Invoke-GhRestJson -ApiArguments @(
        '--method', 'POST',
        "$projectOwnerPath/projectsV2/$($project.number)/items",
        '-f', 'type=Issue',
        '-F', "id=$($issueData.id)"
    )
    # The REST endpoint may return the created item directly or wrap it in value.
    $item = if ($addedItem.PSObject.Properties.Name -contains 'value') {
        $addedItem.value
    } else {
        $addedItem
    }
}

if ($null -eq $item) {
    throw "Project item was not found after registration: Issue #$IssueNumber"
}

$null = Invoke-GhRestJson -ApiArguments @(
    '--method', 'PATCH',
    "$projectOwnerPath/projectsV2/$($project.number)/items/$($item.id)",
    '-F', "fields[][id]=$($statusField.id)",
    '-f', "fields[][value]=$($statusOption.id)"
)

$verifiedItem = Get-ProjectItem
if ($null -eq $verifiedItem) {
    throw "Project item was not found during verification: Issue #$IssueNumber"
}

$verifiedStatus = @($verifiedItem.fields) |
    Where-Object { $_.id -eq $statusField.id } |
    Select-Object -First 1
if ($null -eq $verifiedStatus -or $null -eq $verifiedStatus.value -or $verifiedStatus.value.name.raw -ne $Status) {
    throw "Project status verification failed: Issue #$IssueNumber"
}

[pscustomobject]@{
    Issue = "#$IssueNumber"
    IssueState = $issueData.state.ToUpperInvariant()
    Project = $ProjectTitle
    ProjectStatus = $verifiedStatus.value.name.raw
    Title = $issueData.title
    Url = $issueData.html_url
} | Format-List
