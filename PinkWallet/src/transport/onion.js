import path from 'path'
import http from 'http'
import fs   from 'fs'

const defaultDir = path.join(require('os').homedir(), '.spark-wallet', 'tor')

module.exports = async (app, dir=defaultDir, hs_dir=path.join(dir, 'hidden_service')) => {
  // Start HTTP server (non TLS) on a random port
  const httpPort = await new Promise(resolve => {
    const httpSrv = http.createServer(app).listen(0, '127.0.0.1', _ =>
      resolve(httpSrv.address().port))
  })

  // Get the granax lib, install on demand if its the first time we're using it.
  const granax = await require('./granax-dep')()

  const torConfig = {
    DataDirectory: dir
  , HiddenServiceDir: hs_dir
  , HiddenServiceVersion: 3
  , HiddenServicePort: `80 127.0.0.1:${httpPort}`
  }

  if (process.env.ONION_NONANONYMOUS) {
    console.log('[warn] Tor Hidden Service configured to run in NON-ANONYMOUS mode. It will provide no privacy.')
    Object.assign(torConfig, {
      SocksPort: 0
    , HiddenServiceNonAnonymousMode: 1
    , HiddenServiceSingleHopMode: 1
    })
  }

  // Setup an hidden service over the HTTP server
  return new Promise((resolve, reject) =>
    granax({ authOnConnect: true  }, [ torConfig ])
    .on('error', reject)
    .on('ready', _ => resolve(`http://${getHost(hs_dir)}`))
  )
}

const getHost = dir => fs.readFileSync(path.join(dir, 'hostname')).toString().trim()
