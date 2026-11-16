// Start of each user iteration: pin this thread to its case row, name the
// upload, and reset every per-iteration variable the later steps read.

if (props.get('lcc.setupOk') != 'true') {
    SampleResult.setSuccessful(false)
    SampleResult.setResponseMessage('Setup validation failed (see "00 Setup - validate config"); stopping thread')
    SampleResult.setStopThread(true)
    return
}
SampleResult.setIgnore()

def cases = props.get('lcc.cases')
int threadNum = ctx.threadNum + 1
// caseOffset shifts the whole run down the CSV (offset 10: user 1 -> row 11).
def row = cases[((vars.get('caseOffset') as int) + threadNum - 1) % cases.size()]
int iteration = vars.iteration

// fileSizesMb, when set, replaces the CSV's size for this run.
def sizes = props.get('lcc.fileSizes')
if (sizes) {
    row = row + [fileSizeMb: sizes[(threadNum - 1) % sizes.size()]]
}

// Transfer mode moves the file an earlier upload-mode run left in Egress.
def mode = vars.get('mode')
def prepared = props.get('lcc.prepared')[row.caseId]
if (mode == 'transfer') {
    row = row + [fileSizeMb: prepared.fileSizeMb]
}

row.each { k, v -> vars.put(k, v as String) }

def fileName = "${vars.get('filePrefix')}-${row.fileSizeMb}MB-${vars.get('runId')}-t${threadNum}-i${iteration}.${vars.get('uploadExtension')}"
def tmpDir = new File(System.getProperty('java.io.tmpdir'), "lcc-jmeter-${vars.get('runId')}")
tmpDir.mkdirs()

long chunkBytes = (vars.get('chunkSizeMb') as long) * 1024L * 1024L
long fileBytes = (row.fileSizeMb as long) * 1024L * 1024L

[
    threadLabel       : "t${threadNum}",
    fileName          : fileName,
    fileSizeBytes     : fileBytes as String,
    chunkFile         : new File(tmpDir, "t${threadNum}.part").absolutePath,
    mpBoundary        : "----lccjmeter${UUID.randomUUID().toString().replace('-', '')}",
    chunkCount        : (fileBytes == 0 ? 1 : (long) Math.ceil(fileBytes / (double) chunkBytes)) as String,
    correlationId     : UUID.randomUUID().toString(),
    journeyStart      : System.currentTimeMillis() as String,
    offset            : '0',
    moreChunks        : 'true',
    retryChunk        : 'false',
    chunkAttempt      : '0',
    chunkRetries      : '0',
    uploadId          : '',
    uploadStart       : '0',
    uploadEnd         : '0',
    fileId            : '',
    previousFileId    : '',
    egressFileName    : '',
    egressWaitStart   : '0',
    egressProcessingMs: '',
    egressPolls       : '0',
    pollEgress        : 'false',
    egressReauth      : 'false',
    caseSearchCode    : '',
    // LCC listing takes the folder path without its trailing slash, as the UI sends it
    egressFolderQuery : URLEncoder.encode(vars.get('egressSourceFolder').replaceAll('/+$', ''), 'UTF-8').replace('+', '%20'),
    egressListingStart: '0',
    egressListingMs   : '',
    egressListingPolls: '0',
    pollListing       : 'false',
    fileListed        : 'false',
    listSkip          : '0',
    listPause         : 'false',
    transferId        : '',
    firstPollStatus   : '',
    transientPolls    : '0',
    failedErrorCodes  : '',
    ownsTransfer      : 'false',
    transferStatus    : '',
    transferStart     : '0',
    transferMs        : '',
    transferPolls     : '0',
    pollTransfer      : 'false',
    transferSummary   : '',
    failedStage       : '',
    failureMessage    : '',
].each { k, v -> vars.put(k, v as String) }

// Tokens are kept across iterations and refreshed by age; seed on first use.
if (!vars.get('aadTokenAt')) {
    vars.put('aadTokenAt', '0')
}
if (!vars.get('egressTokenAt')) {
    vars.put('egressTokenAt', '0')
}
if (!vars.get('cmsAuthAt')) {
    vars.put('cmsAuthAt', '0')
}

if (mode == 'transfer') {
    vars.put('fileId', prepared.fileId)
    vars.put('egressFileName', prepared.fileName)
    vars.put('fileName', prepared.fileName)
} else if (mode == 'upload' && prepared?.workspaceId == row.workspaceId) {
    vars.put('previousFileId', prepared.fileId)   // replaced by this upload; 08d deletes it
}
