import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode'
import express from 'express'

const rpath = p => path.join(__dirname, p)

// when installed from npm, the "www" folder contains
// the pre-compiled assets
const preBuilt = fs.existsSync(rpath('www')) && rpath('www')

module.exports = app => {
  app.get('/qr/:data', (req, res) =>
    qrcode.toFileStream(res.type('png'), req.params.data))

  if (preBuilt) {
    const html = fs.readFileSync(path.join(preBuilt, 'index.html'))
      .toString().replace(/\{\{manifestKey\}\}/g, app.settings.manifestKey)
                 .replace(/\{\{accessKey\}\}/g, app.settings.accessKey)

    app.get('/', (req, res) => res.send(html))
    app.use('/', express.static(preBuilt))
  }
  else require('../client/serve')(app)
}
