// Sampler "06 Egress upload - total": initiate -> complete wall time,
// including any chunk retries and their back-off.
long start = vars.get('uploadStart') as long
if (!start) {
    SampleResult.setIgnore()
    return
}
long end = (vars.get('uploadEnd') as long) ?: System.currentTimeMillis()
// Backdate the sample so its elapsed time covers the whole stage. setStartTime
// is protected (Groovy can call it); setStampAndTime throws once JSR223Sampler
// has started the clock.
SampleResult.setStartTime(start)

double mb = (vars.get('fileSizeBytes') as long) / (1024.0 * 1024.0)
def secs = (end - start) / 1000.0
def summary = String.format('%.0fMB in %.1fs (%.2f MB/s), %s chunks, %s retries',
        mb, secs, mb / Math.max(secs, 0.001), vars.get('chunkCount'), vars.get('chunkRetries'))

def stage = vars.get('failedStage')
if (stage?.startsWith('upload')) {
    SampleResult.setSuccessful(false)
    SampleResult.setResponseCode(stage.toUpperCase())
    SampleResult.setResponseMessage("${vars.get('failureMessage')} | ${summary}")
} else {
    SampleResult.setResponseMessage(summary)
}
