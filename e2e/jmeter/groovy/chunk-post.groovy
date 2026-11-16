// PostProcessor on "04 Egress upload - chunk": advance on success, otherwise
// retry up to maxChunkRetries times. Each failed attempt stays in the results
// as a failed "04" sample, so the error % on that row is the retry rate.
int attempt = (vars.get('chunkAttempt') as int) + 1
vars.put('chunkAttempt', attempt as String)
def where = "${vars.get('threadLabel')} chunk ${vars.get('chunkIndex')}/${vars.get('chunkCount')} attempt ${attempt}"

if (prev.responseCode ==~ /2\d\d/) {
    long end = vars.get('chunkEnd') as long
    vars.put('offset', end as String)
    vars.put('retryChunk', 'false')
    vars.put('moreChunks', (end < (vars.get('fileSizeBytes') as long)) as String)
    return
}

prev.setResponseMessage("${prev.responseMessage} [${where}]")
if (prev.responseCode == '401') {
    vars.put('egressReauth', 'true')
}

int maxRetries = vars.get('maxChunkRetries') as int
if (attempt > maxRetries) {
    log.error("${where}: failed (${prev.responseCode}), retries exhausted")
    vars.put('retryChunk', 'false')
    vars.put('moreChunks', 'false')
    vars.put('failedStage', 'upload-chunk')
    vars.put('failureMessage', "Chunk ${vars.get('chunkIndex')}/${vars.get('chunkCount')} failed after ${attempt} attempts (last ${prev.responseCode})")
} else {
    log.warn("${where}: failed (${prev.responseCode}), retrying")
    vars.put('chunkRetries', ((vars.get('chunkRetries') as int) + 1) as String)
}
