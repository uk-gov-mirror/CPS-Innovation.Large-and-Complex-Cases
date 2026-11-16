// Before each chunk: make up the next chunk's bytes, like the Playwright and
// Postman uploads, and wrap them in a multipart/form-data body ("file_content"
// part) written to a per-thread temp file. The PATCH sampler then streams that
// file as its raw body. JMeter's own multipart support only applies to POST,
// and Egress takes chunks via PATCH.
import java.util.concurrent.ThreadLocalRandom

SampleResult.setIgnore()

long offset = vars.get('offset') as long
long size = vars.get('fileSizeBytes') as long
long chunk = (vars.get('chunkSizeMb') as long) * 1024L * 1024L
long end = Math.min(offset + chunk, size)
int len = (int) (end - offset)

def boundary = vars.get('mpBoundary')
def head = ("--${boundary}\r\n" +
            "Content-Disposition: form-data; name=\"file_content\"; filename=\"${vars.get('fileName')}\"\r\n" +
            "Content-Type: application/octet-stream\r\n\r\n").getBytes('UTF-8')
def tail = "\r\n--${boundary}--\r\n".getBytes('UTF-8')

// Random rather than a repeated byte, so nothing on the way can compress it.
byte[] buf = new byte[len]
ThreadLocalRandom.current().nextBytes(buf)
new File(vars.get('chunkFile')).withOutputStream { os ->
    os.write(head)
    os.write(buf)
    os.write(tail)
}

vars.put('chunkEnd', end as String)
vars.put('contentRange', "bytes ${offset}-${end - 1}/${size}")
vars.put('chunkContentType', "multipart/form-data; boundary=${boundary}")
vars.put('chunkIndex', ((offset / chunk) as long) + 1 as String)
vars.put('chunkAttempt', '0')
vars.put('retryChunk', 'true')
