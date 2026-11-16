// Sampler "12 LCC transfer - wait for completion". Its elapsed time is
// initiate -> terminal status. It fails on timeout, Failed/PartiallyCompleted,
// or any failed file.
import groovy.json.JsonSlurper

long start = vars.get('transferStart') as long
long now = System.currentTimeMillis()
SampleResult.setStartTime(start)
vars.put('transferMs', (now - start) as String)

def status = vars.get('transferStatus')
def summary = vars.get('transferSummary') ? new JsonSlurper().parseText(vars.get('transferSummary')) : [:]
def polls = vars.get('transferPolls')
def mins = String.format('%.1f', (now - start) / 60000.0)
SampleResult.setResponseData(vars.get('transferSummary') ?: '{}', 'UTF-8')

int transientCount = vars.get('transientPolls') as int
def notes = []
if (vars.get('firstPollStatus') == 'Failed') {
    notes << 'Failed on first poll'
}
if (transientCount) {
    notes << "errorCode Transient on ${transientCount}/${polls} polls"
}
if (vars.get('failedErrorCodes')) {
    notes << "error codes: ${vars.get('failedErrorCodes')}"
}
def suffix = notes ? " [${notes.join('; ')}]" : ''

def msg
if (status == 'Completed' && (summary.failedFiles ?: 0) == 0) {
    double mb = (vars.get('fileSizeBytes') as long) / (1024.0 * 1024.0)
    def mbps = String.format('%.2f', mb / Math.max((now - start) / 1000.0, 1.0))
    vars.put('transferMBps', mbps)
    SampleResult.setResponseMessage("Completed in ${mins}min (${mbps} MB/s, ${polls} polls)${suffix}")
    return
} else if (status in ['Completed', 'PartiallyCompleted', 'Failed']) {
    msg = "Transfer ${status} after ${mins}min: ${summary.failedFiles ?: 0}/${summary.totalFiles ?: '?'} failed" +
          (summary.errorMessage ? " (${summary.errorMessage})" : '') + suffix
    SampleResult.setResponseCode(status.toUpperCase())
} else {
    int maxPolls = vars.get('transferMaxPolls') as int
    def limit = maxPolls > 0 && (polls as int) >= maxPolls ? "max ${maxPolls} polls" : "${vars.get('transferTimeoutMin')}min timeout"
    msg = "Transfer polling timeout (${limit}) after ${mins}min; last status '${status ?: 'none'}'" +
          (summary ? ", processed ${summary.processedFiles ?: 0}/${summary.totalFiles ?: '?'}" : '') + suffix
    SampleResult.setResponseCode('TIMEOUT')
}
SampleResult.setSuccessful(false)
SampleResult.setResponseMessage(msg)
vars.put('failedStage', 'transfer')
vars.put('failureMessage', msg)
