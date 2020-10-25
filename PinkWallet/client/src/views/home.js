import { div, ul, li, a, span, button, small, p, strong } from '@cycle/dom'
import { yaml, ago, showDesc, pluralize } from './util'

const perPage = 10

const hasCam = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    , preferCam = hasCam && ('ontouchstart' in window)

const home = ({ feed, feedStart, feedActive, unitf, obalance, cbalance, channels, funds, conf: { expert } }) => !feed ? '' : div([

  // Main buttons
  div('.row.mb-2', [
    div('.col-sm-6.mb-2', a('.btn.btn-lg.btn-primary.btn-block', { attrs: { href: preferCam ? '#/scan' : '#/payreq' } }, 'Pay'))
  , div('.col-sm-6.mb-2', a('.btn.btn-lg.btn-secondary.btn-block', { attrs: { href: '#/recv' } }, 'Request'))
  , expert ? div('.col-sm-6', a('.btn.btn-lg.btn-info.btn-block.mb-2', { attrs: { href: '#/logs' } }, 'Logs')) : ''
  , expert ? div('.col-sm-6', a('.btn.btn-lg.btn-warning.btn-block.mb-2', { attrs: { href: '#/rpc' } }, 'Console')) : ''
  ])

 // Balance overview
, channels && funds ? balanceOverview({ obalance, cbalance, channels, funds, unitf }) : ''


  // Payments feed
, ...(!feed.length ? [ p('.text-center.text-muted.mt-4', 'You have no incoming or outgoing payments.') ] : [
    ul('.list-group.feed', feed.slice(feedStart, feedStart+perPage).map(itemRenderer({ feedActive, unitf, expert })))
  , paging(feed.length, feedStart)
  ])])

const itemRenderer = ({ feedActive, unitf, expert }) => ([ type, ts, msat, obj ]) => {
  const fid     = `${type}-${obj.payment_hash}`
      , visible = fid == feedActive
      , tsStr   = new Date(ts*1000).toLocaleString()

  return li('.list-group-item', { class: { active: visible, 'list-group-item-action': !visible }, dataset: { feedToggle: fid } }, [
    div('.clearfix', [
      type === 'in' ? span('.amt.badge.badge-success.badge-pill', `+${ unitf(msat) }`)
                    : span('.amt.badge.badge-danger.badge-pill', `-${ unitf(msat) }`)
    , span('.ts.badge.badge-secondary.float-right', { attrs: { title: tsStr } }, ago(ts))
    ])
  , !visible ? '' : ul('.list-unstyled.my-3', [
      li([ strong(type == 'in' ? 'Received:' : 'Sent:'), ' ', tsStr ])
    , type == 'in' && obj.msatoshi_received > obj.msatoshi ? li([ strong('Overpayment:'), ' ', unitf(obj.msatoshi_received-obj.msatoshi) ]) : ''
    , type == 'out' && obj.msatoshi ? li([ strong('Fee:'), ' ', feesText(obj, unitf) ]) : ''
    , showDesc(obj) ? li([ strong('Description:'), ' ', span('.break-word', obj.description) ]) : ''
    , type == 'out' && obj.destination ? li([ strong('Destination:'), ' ', small('.break-all', obj.destination) ]) : ''
    , li([ strong('Payment hash:'), ' ', small('.break-all', obj.payment_hash) ])
    , expert ? li(yaml(obj)) : ''
    ])
  ])
}

const feesText = ({ msatoshi: quoted, msatoshi_sent: sent }, unitf) =>
  `${unitf(sent-quoted)} (${((sent-quoted)/quoted*100).toFixed(2)}%)`

const paging = (total, start) => total <= perPage ? '' :
  div('.d-flex.justify-content-between.mt-2', [
    pageLink('newer', start > 0 ? start-perPage : null)
  , small('.align-self-center.text-muted', `showing ${+start+1} to ${Math.min(total, +start+perPage)} of ${total}`)
  , pageLink('older', start+perPage < total ? start+perPage : null)
  ])

const pageLink = (label, start, active) =>
  start == null ? button('.btn.btn-sm.btn-link.invisible', label)
                : button('.btn.btn-sm.btn-link', { dataset: { feedStart: ''+start } }, label)

const balanceOverview = ({ obalance, cbalance, channels, funds, unitf }) => {
  if (!obalance && !cbalance) return;

  const colSize = obalance && cbalance ? 6 : 12
      , chanNum = channels.filter(c => c.chan.state == 'CHANNELD_NORMAL').length

  return div('.balance-overview.card.text-center.mb-3', div('.card-body.p-2',
    div('.row', [
      cbalance ? div(`.col-${colSize}`, div('.container', [
        p('.mb-0.font-weight-light', [ unitf(cbalance), ' ', span('.text-muted', pluralize`in ${chanNum} channel`) ])
      ])) : ''
    , obalance ? div(`.col-${colSize}`, div('.container', [
        p('.mb-0.font-weight-light', [ unitf(obalance), ' ', span('.text-muted', pluralize`in ${funds.outputs.length} output`) ])
      ])) : ''
    ])
  ))
}

module.exports = { home }
