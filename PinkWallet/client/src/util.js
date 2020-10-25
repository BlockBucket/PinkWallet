import debug  from 'debug'
import bolt11 from 'bolt11'
import numbro from 'numbro'
import stringArgv from 'string-argv'
import { Big as big } from 'big.js'
import { Observable as O } from './rxjs'

export const formatAmt = (amt, rate, digits, comma=true) =>
  (amt != null && ''+amt && rate)
    ? numbro(big(amt).times(rate).toFixed(digits))
        .format({ thousandSeparated: comma, mantissa: digits, trimMantissa: true, optionalMantissa: true })
    : ''

const reUri = /^lightning:([a-z0-9]+)|^bitcoin:.*[?&]lightning=([a-z0-9]+)|^(ln[a-z0-9]+)$/i

export const parseUri = uri => {
  const m = uri.trim().match(reUri)
  return m && (m[1] || m[2] || m[3]).toLowerCase()
}

// returns the expected invoice amount when its <0.5% different from the actual amount paid,
// or the actual amount paid otherwise. this is done to make the UX less confusing when the
// sender uses overpayment randomization (https://github.com/ElementsProject/lightning/issues/1089)
export const recvAmt = ({ msatoshi: expected, msatoshi_received: actual }) =>
  (expected && (actual-expected)/expected<0.005) ? expected : actual

// Parse "listpeers" to get all channels as a list of (peer,channel) tuples
export const getChannels = peers => [].concat(...peers.map(peer => peer.channels.map(chan => ({ peer, chan }))))

// Parse the `sat`-suffixed amount string fields into numbers
// and extract additional information from the bolt11 request
export const parsePayment = p => ({
  ...p
, msatoshi: p.amount_msat ? +p.amount_msat.slice(0, -4) : null
, msatoshi_sent: +p.amount_sent_msat.slice(0, -4)
, destination: p.destination || parseBolt11(p).destination || null // expected to become available in the next c-lightning release
, description: p.description || parseBolt11(p).description || null
})

export const parseBolt11 = (cached => p => {
  if (!p.bolt11 || p.bolt11 == '(null)') return {}
  if (cached[p.payment_hash]) return cached[p.payment_hash]

  try {
    const decoded = bolt11.decode(p.bolt11)
        , destination = decoded.payeeNodeKey
        , desc_tag = decoded.tags.find(t => t.tagName == 'description')
        , description = desc_tag ? desc_tag.data : null

    return cached[p.payment_hash] = { destination, description }
  } catch (err) {
    console.error('failed decoding bolt11:', err)
    return cached[p.payment_hash] = {}
  }
})({})

export const combine = obj => {
  const keys = Object.keys(obj).map(k => k.replace(/\$$/, ''))
  return O.combineLatest(...Object.values(obj), (...xs) =>
    xs.reduce((o, x, i) => (o[keys[i]] = x, o), {}))
}

export const toObs = x => (x.subscribe || x.then) ? O.from(x) : O.of(x)

export const dropErrors = r$$ => r$$.flatMap(r$ => r$.catch(_ => O.empty()))

export const extractErrors = r$$ =>
  r$$.flatMap(r$ => r$.flatMap(_ => O.empty()).catch(err => O.of(err)))
    .map(e => e.response && (e.response.body && e.response.body.message || e.response.body) || e)

export const formatError = err => (err.message && err.message.startsWith('Request has been terminated'))
  ? new Error('Connection to server lost.')
  : err

const connErrors = [ 'Error: Connection to server lost.', 'Error: Unauthorized', 'Error: Not Found', 'Error: Bad Gateway', 'Error: Service Unavailable' ]
export const isConnError = err => connErrors.includes(err.toString())

export const dbg = (obj, label='stream', dbg=debug(label)) =>
  Object.keys(obj).forEach(k => obj[k] && obj[k].subscribe(
    x   => dbg(`${k} ->`, x)
  , err => dbg(`${k} \x1b[91mError:\x1b[0m`, err.stack || err)
  , _   => dbg(`${k} completed`)))

const specialArgs = { 'true': true, 'false': false }

export const parseRpcCmd = str => {
  const [ method, ...args ] = stringArgv(str)
  return [ method, ...args.map(arg => arg in specialArgs ? specialArgs[arg] : arg) ]
}
