// setUp thread group: fail fast on bad config before any load is generated,
// and load the cases CSV once so each user thread is pinned to its own row.
import java.util.concurrent.ConcurrentHashMap
import org.apache.jmeter.services.FileServer

def baseDir = FileServer.fileServer.baseDir
def resolve = { String p -> def f = new File(p); f.absolute ? f : new File(baseDir, p) }
def problems = []
def warnings = []

def searchCase = vars.get('searchCase') == 'true'
def required = ['lccApiBaseUrl', 'egressBaseUrl', 'aadAuthority', 'tenantId', 'lccApiClientId',
                'aadUsername', 'aadPassword', 'egressServiceAccountAuth', 'egressSourceFolder']
if (searchCase || vars.get('cleanupNetAppAfterTransfer') == 'true') {
    // Case search and NetApp delete need a CMS session (Cms-Auth-Values cookie) from DDEI.
    required += ['cmrcApiClientId', 'ddeiBaseUrl', 'ddeiAccessKey', 'cmsUsername', 'cmsPassword']
}
required.each { name ->
    def v = vars.get(name)?.trim()
    if (!v || v.startsWith('CHANGE_ME') || v.startsWith('${')) {
        problems << "Property '${name}' is not set (check config/env-<env>.properties)"
    }
}

def mode = vars.get('mode')
if (!(mode in ['e2e', 'upload', 'transfer'])) {
    problems << "mode '${mode}' must be 'e2e', 'upload' or 'transfer'"
}

// fileSizesMb overrides the CSV's fileSizeMb for this run: one size for every
// user, or a list handed out in user order (user 1 the first size, and so on).
def fileSizes = (vars.get('fileSizesMb') ?: '').split(/[,;\s]+/)*.trim().findAll { it }
fileSizes.findAll { !(it ==~ /\d+/) || (it as long) == 0 }.each {
    problems << "fileSizesMb: '${it}' is not a whole number of MB"
}

int users = vars.get('users') as int
def casesFile = resolve(vars.get('casesCsv'))
def cases = []
if (!casesFile.exists()) {
    problems << "Cases CSV not found: ${casesFile}"
} else {
    def lines = casesFile.readLines('UTF-8').findAll { it.trim() }
    def header = lines ? lines[0].split(',')*.trim() : []
    def expected = ['caseId', 'workspaceId', 'netappFolderPath', 'fileSizeMb', 'caseUrn']
    if (header != expected && header != expected.take(4)) {
        problems << "Cases CSV header must be '${expected.join(',')}' (caseUrn optional unless searchCase=true) but was '${header.join(',')}'"
    } else {
        lines.drop(1).eachWithIndex { line, i ->
            def cols = line.split(',', -1)*.trim()
            def urn = cols.size() > 4 ? cols[4] : ''
            if (cols.size() != header.size() || cols.take(4).any { !it || it.startsWith('CHANGE_ME') }) {
                problems << "Cases CSV row ${i + 2} is incomplete: '${line}'"
            } else if (!(cols[3] ==~ /\d+/)) {
                problems << "Cases CSV row ${i + 2}: fileSizeMb '${cols[3]}' is not a whole number"
            } else if (searchCase && (!urn || urn.startsWith('CHANGE_ME'))) {
                problems << "Cases CSV row ${i + 2}: caseUrn is required when searchCase=true"
            } else {
                def folder = cols[2].endsWith('/') ? cols[2] : cols[2] + '/'
                cases << [caseId: cols[0], workspaceId: cols[1], netappFolderPath: folder, fileSizeMb: cols[3], caseUrn: urn]
            }
        }
    }
}

def caseOffset = vars.get('caseOffset')?.trim()
if (!(caseOffset ==~ /\d+/)) {
    problems << "caseOffset '${caseOffset}' must be a whole number (0 = start at the first CSV row)"
    caseOffset = '0'
}
int offset = caseOffset as int
if (cases && offset >= cases.size()) {
    problems << "caseOffset ${offset} is past the end of the cases CSV (${cases.size()} rows)"
} else if (cases && offset + users > cases.size()) {
    warnings << "caseOffset ${offset} + ${users} users runs past the ${cases.size()} CSV rows; later users wrap to the first rows"
}

if (cases) {
    // Threads take rows by thread number from caseOffset, wrapping when they run out of rows.
    def assigned = (0..<users).collect { cases[(offset + it) % cases.size()] }
    def duplicates = assigned.groupBy { it.caseId }.findAll { k, v -> v.size() > 1 }.keySet()
    if (duplicates) {
        def msg = "Case(s) ${duplicates.join(', ')} are shared by more than one of the ${users} users. " +
                  "LCC allows one active transfer per case: a second initiate returns the FIRST " +
                  "transfer's id and the second user's file is never moved. Add a row per user " +
                  "(or set allowSharedCase=true to deliberately test that behaviour)."
        if (vars.get('allowSharedCase') == 'true') {
            warnings << msg
        } else {
            problems << msg
        }
    }

    // Uploaded files from earlier upload-mode runs: last line per case wins.
    def preparedFile = resolve(vars.get('preparedCsv'))
    def prepared = new ConcurrentHashMap()
    if (preparedFile.exists()) {
        preparedFile.readLines('UTF-8').drop(1).findAll { it.trim() }.each { line ->
            def c = line.split(',', -1)*.trim()
            if (c.size() >= 5) {
                prepared[c[0]] = [caseId: c[0], workspaceId: c[1], fileId: c[2], fileName: c[3], fileSizeMb: c[4]]
            }
        }
    }
    props.put('lcc.prepared', prepared)
    props.put('lcc.preparedFile', preparedFile.absolutePath)

    if (mode == 'transfer') {
        def missing = assigned.findAll { prepared[it.caseId]?.workspaceId != it.workspaceId }*.caseId.unique()
        if (missing) {
            problems << "Transfer mode: no uploaded file recorded in ${preparedFile} for case(s) ${missing.join(', ')}. " +
                        "Run with -Mode Upload first (same -Users and caseOffset)."
        }
        if (fileSizes) {
            warnings << "fileSizesMb is ignored in transfer mode: each case transfers the file it uploaded"
        }
    }
}

warnings.each { log.warn(it) }

if (problems) {
    problems.each { log.error(it) }
    SampleResult.setSuccessful(false)
    SampleResult.setResponseMessage("Harness config invalid: " + problems.join(' | '))
    SampleResult.setResponseData(problems.join('\n'), 'UTF-8')
    SampleResult.setStopTest(true)
    props.put('lcc.setupOk', 'false')
    return
}

def resultsDir = resolve(vars.get('resultsDir'))
resultsDir.mkdirs()
def outcomes = new File(resultsDir, 'transfers.csv')
if (!outcomes.exists()) {
    outcomes.write('runId,thread,iteration,caseId,workspaceId,fileSizeMb,fileName,result,failedStage,' +
                   'caseSearchCode,uploadMs,chunks,chunkRetries,egressProcessingMs,egressPolls,' +
                   'egressListingMs,egressListingPolls,transferId,firstPollStatus,transferStatus,' +
                   'transferMs,transferPolls,transientPolls,failedErrorCodes,transferMBps,e2eMs,message\n', 'UTF-8')
}

props.put('lcc.cases', cases)
props.put('lcc.fileSizes', fileSizes)
props.put('lcc.transferOwners', new ConcurrentHashMap())
props.put('lcc.outcomesFile', outcomes.absolutePath)
props.put('lcc.setupOk', 'true')

def summary = "Run ${vars.get('runId')}: ${users} users, ramp-up ${vars.get('rampUpSec')}s, ${cases.size()} case row(s), " +
              "chunk ${vars.get('chunkSizeMb')}MB x${vars.get('maxChunkRetries')} retries, " +
              "${vars.get('transferType')} transfer polled every ${vars.get('transferPollIntervalSec')}s " +
              "(max ${vars.get('transferMaxPolls')} polls / ${vars.get('transferTimeoutMin')}min), " +
              "searchCase=${searchCase}, waitForEgressListing=${vars.get('waitForEgressListing')}, results -> ${resultsDir}"
log.info(summary)
SampleResult.setResponseData((summary + '\n' + warnings.join('\n')).trim(), 'UTF-8')
