// Sampler "14 E2E journey": one row per user iteration covering the whole
// journey. It passes only if every stage passed. It also appends a line to
// transfers.csv, a per-file breakdown that the JMeter summary can't give.
long start = vars.get('journeyStart') as long
long now = System.currentTimeMillis()
SampleResult.setStartTime(start)

def stage = vars.get('failedStage')
def message = vars.get('failureMessage') ?: ''
if (stage) {
    SampleResult.setSuccessful(false)
    SampleResult.setResponseCode(stage.toUpperCase())
    SampleResult.setResponseMessage("[${stage}] ${message}")
} else {
    SampleResult.setResponseMessage("OK ${vars.get('fileSizeMb')}MB case ${vars.get('caseId')}")
}

long uploadStart = vars.get('uploadStart') as long
long uploadEnd = vars.get('uploadEnd') as long
def csv = { v -> def s = (v ?: '').toString(); s.contains(',') || s.contains('"') ? '"' + s.replace('"', '""') + '"' : s }
def row = [
    vars.get('runId'), vars.get('threadLabel'), vars.iteration, vars.get('caseId'), vars.get('workspaceId'),
    vars.get('fileSizeMb'), vars.get('fileName'), stage ? 'FAIL' : 'PASS', stage, vars.get('caseSearchCode'),
    (uploadStart ? (uploadEnd ?: now) - uploadStart : ''), vars.get('chunkCount'), vars.get('chunkRetries'),
    vars.get('egressProcessingMs'), vars.get('egressPolls'), vars.get('egressListingMs'), vars.get('egressListingPolls'),
    vars.get('transferId'), vars.get('firstPollStatus'), vars.get('transferStatus'), vars.get('transferMs'),
    vars.get('transferPolls'), vars.get('transientPolls'), vars.get('failedErrorCodes'), vars.get('transferMBps'),
    now - start, message,
].collect(csv).join(',')

def outFile = new File(props.get('lcc.outcomesFile'))
synchronized (props) {
    outFile.append(row + '\n', 'UTF-8')
}

new File(vars.get('chunkFile')).delete()
vars.remove('transferMBps')
