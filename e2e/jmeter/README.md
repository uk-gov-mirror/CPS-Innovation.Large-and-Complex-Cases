# LCC E2E performance test (JMeter)

Uploads files to Egress and transfers them to NetApp through the LCC API, with
several users at once. Defaults match the original smoke test: 10 users, 30s
ramp-up, one file each.

## Layout

```
lcc-e2e-perf.jmx                  test plan
groovy/                           step logic used by the plan
config/load-profile.properties    users, timeouts, retries (committed)
config/env-<env>.properties       URLs and credentials (git-ignored)
data/cases-<env>.csv              one case per user (git-ignored)
data/egress-files-<env>.csv       files left in Egress by upload runs (git-ignored)
scripts/provision-cases.ts        creates the cases
scripts/Run-PerfTest.ps1          runs the test
```

## Setup

You need Java 17+ and JMeter 5.6.3 with `JMETER_HOME` set. No plugins.
Run everything from `e2e/jmeter`.

1. Credentials:

   ```powershell
   Copy-Item config\env.template.properties config\env-staging.properties
   ```

   Fill it in. The template lists the matching `.env.<env>` key for each value.

2. Cases (once per environment):

   ```powershell
   npx -y tsx scripts/provision-cases.ts --env staging --count 100
   ```

   See [Creating cases](#creating-cases).

Each upload is generated on the fly as random bytes,
at the size in the case's `fileSizeMb` column.

## Modes

| step | `E2E` (default) | `Upload` | `Transfer` |
| --- | :---: | :---: | :---: |
| Sign in to AAD, Egress and CMS (via DDEI) | ✓ | ✓ | ✓ |
| `01c` Search for the case by URN | ✓ | ✓ | ✓ |
| `03`–`06` Upload to Egress in 5MB chunks | ✓ | ✓ | |
| `07`–`08` Wait for Egress to give the file a `file_id` | ✓ | ✓ | |
| `08a`–`08b` Wait for the file to appear in the LCC Egress listing | ✓ | ✓ | |
| `08c` Record the file in `egress-files-<env>.csv` | | ✓ | |
| `08d` Delete the case's previous upload from Egress | | ✓ | |
| `09`–`10` Validate and start the transfer | ✓ | | ✓ |
| `11`–`12` Poll the transfer status until it finishes | ✓ | | ✓ |
| `12a` Delete the source file from Egress (Copy only) | ✓ | | |
| `12b` Delete the copied file from NetApp (if Completed) | ✓ | | ✓ |
| `13` Clear the transfer from the case | ✓ | | ✓ |
| `14` Record the result in `transfers.csv` | ✓ | ✓ | ✓ |

Use `Upload` + `Transfer` when you want all transfers to start together. In
`E2E` the files finish Egress processing minutes apart, so only a few
transfers overlap.

```powershell
./scripts/Run-PerfTest.ps1 -Mode Upload -FileSizesMb 2048   # once
./scripts/Run-PerfTest.ps1 -Mode Transfer -RampUpSec 0      # repeat as often as you like
```

Transfer mode leaves the file in Egress, so you can repeat it. Use the same
`-Users` and `caseOffset` as the upload run. With `transferType=Move` the
file leaves Egress, so you need a new upload before each transfer run.

## Running

```powershell
./scripts/Run-PerfTest.ps1 -Users 1 -Label sanity           # check the setup first
./scripts/Run-PerfTest.ps1                                  # 10 users
./scripts/Run-PerfTest.ps1 -FileSizesMb 100,1024            # users alternate 100MB / 1GB
./scripts/Run-PerfTest.ps1 -Property transferMaxPolls=0,transferTimeoutMin=30
./scripts/Run-PerfTest.ps1 -Gui                             # open in the JMeter GUI
```

| option | default | |
| --- | --- | --- |
| `-Mode` | `E2E` | `E2E`, `Upload` or `Transfer` |
| `-Users` | 10 | number of users |
| `-RampUpSec` | 30 | time to start all users; `0` = all at once |
| `-Loops` | 1 | files per user, one after another |
| `-FileSizesMb` | CSV | one size for everyone, or a list handed out in user order. Ignored in `Transfer` |
| `-Property` | | any setting below, `name=value,name=value` |
| `-Label` | | added to the results folder name |
| `-Environment` | `staging` | picks `config/env-<env>.properties` and `data/*-<env>.csv` |
| `-CasesCsv` | `data/cases-<env>.csv` | a different cases file |
| `-JMeterHome` | `$env:JMETER_HOME` | |
| `-Gui` | | open the plan with the same settings instead of running it |

### Without the script

```powershell
jmeter -n -t lcc-e2e-perf.jmx `
  -q config\load-profile.properties -q config\env-staging.properties `
  -Jmode=e2e -JresultsDir=results\manual -JrunId=manual `
  -l results\manual\results.jtl -j results\manual\jmeter.log -e -o results\manual\report
```

Add `-Jname=value` for any setting. Drop `-n` and the output options to open
the GUI.

## Which case each user gets

User *n* takes row `caseOffset + n` of the cases CSV, wrapping to the top if
the CSV runs out. Every run uses the same rows unless you change
`caseOffset`.

Transfer mode then looks up that case's file in `egress-files-<env>.csv` by
`caseId`. If a case has several lines, the last one wins.

Before sending any load, `00 Setup` checks the config and stops if:

- a setting or CSV row is missing or invalid
- two users would share a case (allow with `allowSharedCase=true`)
- in `Transfer` mode, a case has no recorded upload, or its `workspaceId` doesn't match

One case per user matters because LCC allows one active transfer per case. A
second initiate on the same case returns the first transfer's id.

If you stop a run mid-transfer, the transfers keep going in the background.
Wait a few minutes or move to fresh rows with `-Property caseOffset=10`.

## Settings

Defaults are in `config/load-profile.properties`. Override per run with
`-Property name=value`.

**Run**

| setting | default | |
| --- | --- | --- |
| `users` / `rampUpSec` / `loops` / `mode` | 10 / 30 / 1 / e2e | same as the script options |
| `casesCsv` | `data/cases-staging.csv` | |
| `preparedCsv` | `data/egress-files-staging.csv` | written by Upload, read by Transfer |
| `caseOffset` | 0 | user 1 takes row `caseOffset + 1` |
| `allowSharedCase` | false | |
| `fileSizesMb` | empty | overrides the CSV sizes |
| `filePrefix` / `uploadExtension` | `jmeter-perf` / `txt` | uploaded file name |

**Case search**

| setting | default | |
| --- | --- | --- |
| `searchCase` | true | run `01c`. Failures are recorded but don't stop the user |
| `cmsRefreshMin` | 30 | |

**Upload**

| setting | default | |
| --- | --- | --- |
| `egressSourceFolder` | `1. ABEs for Transcript/` | |
| `chunkSizeMb` | 5 | |
| `maxChunkRetries` | 3 | retries after the first attempt |
| `chunkRetryDelayMs` | 0 | pause before a retry |

**Egress processing**

| setting | default | |
| --- | --- | --- |
| `egressFixedWaitSec` | 0 | fixed wait before polling, as the smoke test did |
| `egressPollIntervalMs` | 2000 | |
| `egressProcessingTimeoutSec` | 90 | `08` fails after this |
| `waitForEgressListing` | true | run `08a`/`08b` |
| `egressListingPollIntervalMs` | 3000 | |
| `egressListingTimeoutSec` | 90 | `08b` fails after this; 0 = one pass |
| `egressListingTake` | 100 | page size; all pages are checked each pass |

**Transfer**

| setting | default | |
| --- | --- | --- |
| `transferType` | Copy | or Move |
| `validateBeforeTransfer` | true | call `09` before `10` |
| `transferPollIntervalSec` | 5 | |
| `transferMaxPolls` | 30 | 0 = no limit |
| `transferTimeoutMin` | 60 | stops polling regardless of the poll count |

Polling stops at `Completed`, `PartiallyCompleted` or `Failed`, or when either
limit is hit.

**Clean-up**

| setting | default | |
| --- | --- | --- |
| `cleanupEgressAfterCopy` | true | `12a`; never in Transfer mode |
| `cleanupNetAppAfterTransfer` | true | `12b`; only when the transfer Completed |
| `clearTransfers` | true | `13` |

Clean-up only runs for the user that started the transfer.

**Tokens and HTTP**

| setting | default | |
| --- | --- | --- |
| `aadRefreshMin` | 45 | |
| `egressRefreshMin` | 8 | Egress tokens expire after 10 minutes |
| `httpConnectTimeoutMs` | 30000 | |
| `httpResponseTimeoutMs` | 300000 | |

A 401 forces a new token on the next request.

**Environment** (`config/env-<env>.properties`)

| setting | used for |
| --- | --- |
| `lccApiBaseUrl`, `egressBaseUrl` | |
| `tenantId`, `lccApiClientId`, `aadUsername`, `aadPassword` | AAD sign-in |
| `egressServiceAccountAuth` | Egress sign-in |
| `cmrcApiClientId`, `ddeiBaseUrl`, `ddeiAccessKey`, `cmsUsername`, `cmsPassword` | CMS session: case search, NetApp clean-up, creating cases |
| `caseApiBaseUrl` | creating cases only |
| `egressTemplateId`, `egressAdminRoleId` | optional, creating cases only |

## Results

Each run writes to `results/<env>[-<mode>][-<label>]-<timestamp>/`:

| file | |
| --- | --- |
| `report/index.html` | JMeter dashboard |
| `transfers.csv` | one row per file: stage times, retries, transfer status, PASS/FAIL |
| `results.jtl` | raw samples |
| `jmeter.log` | log, including chunk retries |

The script prints `transfers.csv` as a table at the end.

Dashboard rows to look at:

| row | measures |
| --- | --- |
| `01`–`02` | sign-in |
| `01c` | case search |
| `04` | each chunk attempt; retries show as errors |
| `06` | whole upload |
| `08` | upload complete → `file_id` |
| `08b` | `file_id` → listed in LCC |
| `12` | transfer start → finish; `TIMEOUT` or `FAILED` on error |
| `12a`, `12b`, `13` | clean-up; failures don't fail the journey |
| `14` | whole journey; error % = files that didn't make it |

Error % counts requests, not files. Use `transfers.csv` for per-file results.

To check a fix, run the same settings before and after, ideally twice each:

| problem | look at |
| --- | --- |
| chunk failures | `04` error %, `chunkRetries` |
| Egress processing delay | `08`, `08b` times |
| case search errors | `01c` error % |
| transfer timeouts | `12`, `transferStatus` |
| overall | `14` error % |

## Data files

| file | written by | read by |
| --- | --- | --- |
| `cases-<env>.csv` | `provision-cases.ts` | every run |
| `cases-<env>.csv.provision.jsonl` | `provision-cases.ts` | you, when cleaning up |
| `egress-files-<env>.csv` | Upload runs | Transfer runs |

`cases-<env>.csv`: `caseId,workspaceId,netappFolderPath,fileSizeMb,caseUrn`.
Edit `fileSizeMb` to change a user's file size.

`egress-files-<env>.csv`: `caseId,workspaceId,fileId,fileName,fileSizeMb,runId`.
Lines are only appended; the last line per case is the current file.

`.provision.jsonl`: one JSON object per line, one line per provisioning step.

## Creating cases

`provision-cases.ts` creates `--count` rows in total. Rows already in the CSV
count, so re-running fills gaps rather than adding more. For each new case it:

1. registers a case (surname `JMETERPERF`)
2. creates Egress workspace `JMETER-PERF-<yyyyMMdd>-<nnn>` and adds the test user
3. connects the workspace to the case
4. creates NetApp folder `jmeter-perf/jmeter-perf-<yyyyMMdd>-<nnn>/` and connects it
5. reads the case back to check both connections, then appends a CSV row

Every step is logged to the `.provision.jsonl` file. A failed case isn't
rolled back. Use the log to find and remove what it left behind.

`JMETER-PERF` names are skipped by the automation clean-up jobs, so the cases
stay between runs.

| option | default |
| --- | --- |
| `--env` | `staging` |
| `--count` | 10 |
| `--out` | `data/cases-<env>.csv` |
| `--prefix` | `JMETER-PERF` |
| `--netapp-parent` | `jmeter-perf` (`""` = bucket root) |
| `--sizes` | `100,425,450,1024,100,425,450,1024,100,1024` |
| `--concurrency` | 3 |

## Things to know

- Egress processes uploads one at a time. With 10 users the last file can
  take over four minutes, so most users fail `08` at the default 90s. To
  measure the transfer instead, use
  `-Property egressProcessingTimeoutSec=900,egressListingTimeoutSec=300`.
- The first few status polls usually return 404 while the transfer is set up.
  These count as OK, but they use up polls.
- `errorCode: Transient` on a running transfer means a retry is in progress.
  If those transfers time out, try `transferMaxPolls=0` before calling it a hang.
- If an E2E upload fails before its transfer, the file stays in Egress.

## Troubleshooting

| symptom | likely cause |
| --- | --- |
| stops at `00 Setup` | read the message: missing setting, bad CSV row, shared case, or no recorded upload |
| `01` 400 | wrong AAD username, password or client id |
| `01b` 401/403 | wrong DDEI key or CMS credentials |
| `01c` 400 every time | CMS sign-in failed, or wrong URN |
| `02` 401 | wrong `egressServiceAccountAuth` |
| `03` 403/404 | wrong workspace id, or no access |
| `08b` never finds the file | wrong `egressSourceFolder`, or no permission on the workspace |
| `10` "already belongs to" | case shared, or a transfer left running from an earlier run |
| `12` always times out | check the FileTransfer function app; try a longer window |
