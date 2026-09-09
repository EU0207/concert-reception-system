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

function Invoke-GhJson {
    param([Parameter(Mandatory = $true)][string[]]$GhArguments)

    $output = & gh @GhArguments
    if ($LASTEXITCODE -ne 0) {
        throw "gh command failed: gh $($GhArguments -join ' ')"
    }

    return ($output | Out-String | ConvertFrom-Json)
}

$projectData = Invoke-GhJson -GhArguments @('project', 'list', '--owner', $Owner, '--format', 'json')
$project = @($projectData.projects) |
    Where-Object { $_.title -eq $ProjectTitle -and -not $_.closed } |
    Select-Object -First 1

if ($null -eq $project) {
    throw "Open project not found: $ProjectTitle"
}

$fieldData = Invoke-GhJson -GhArguments @(
    'project', 'field-list', [string]$project.number,
    '--owner', $Owner,
    '--format', 'json'
)
$statusField = @($fieldData.fields) |
    Where-Object { $_.name -eq 'Status' -and $_.type -eq 'ProjectV2SingleSelectField' } |
    Select-Object -First 1

if ($null -eq $statusField) {
    throw 'Project Status field not found.'
}

$statusOption = @($statusField.options) |
    Where-Object { $_.name -eq $Status } |
    Select-Object -First 1

if ($null -eq $statusOption) {
    throw "Project status option not found: $Status"
}

$issueData = Invoke-GhJson -GhArguments @(
    'issue', 'view', [string]$IssueNumber,
    '--repo', $Repository,
    '--json', 'number,url,state,title'
)

if ($Status -eq '完了' -and $issueData.state -ne 'CLOSED') {
    throw "Issue must be CLOSED before setting Project status to 完了: Issue #$IssueNumber"
}

if ($Status -ne '完了' -and $issueData.state -eq 'CLOSED') {
    throw "Closed Issue must use Project status 完了: Issue #$IssueNumber"
}

function Get-ProjectItem {
    $itemData = Invoke-GhJson -GhArguments @(
        'project', 'item-list', [string]$project.number,
        '--owner', $Owner,
        '--limit', '1000',
        '--format', 'json'
    )

    return @($itemData.items) |
        Where-Object {
            $_.content.type -eq 'Issue' -and
            $_.content.number -eq $IssueNumber -and
            $_.content.repository -eq $Repository
        } |
        Select-Object -First 1
}

$item = Get-ProjectItem
if ($null -eq $item) {
    $null = Invoke-GhJson -GhArguments @(
        'project', 'item-add', [string]$project.number,
        '--owner', $Owner,
        '--url', $issueData.url,
        '--format', 'json'
    )
    $item = Get-ProjectItem
}

if ($null -eq $item) {
    throw "Project item was not found after registration: Issue #$IssueNumber"
}

$editArguments = @(
    'project', 'item-edit',
    '--id', [string]$item.id,
    '--project-id', [string]$project.id,
    '--field-id', [string]$statusField.id,
    '--single-select-option-id', [string]$statusOption.id
)
& gh @editArguments
if ($LASTEXITCODE -ne 0) {
    throw "Failed to update Project status: Issue #$IssueNumber"
}

$verifiedItem = Get-ProjectItem
if ($null -eq $verifiedItem -or $verifiedItem.status -ne $Status) {
    throw "Project status verification failed: Issue #$IssueNumber"
}

[pscustomobject]@{
    Issue = "#$IssueNumber"
    IssueState = $issueData.state
    Project = $ProjectTitle
    ProjectStatus = $verifiedItem.status
    Title = $issueData.title
    Url = $issueData.url
} | Format-List
