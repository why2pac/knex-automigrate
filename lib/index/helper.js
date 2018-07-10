module.exports = {
  innerBrackets: function (e) {
    var begin = e.indexOf('(')
    var end = e.lastIndexOf(')')

    if (begin === -1 || end === -1) return null
    return e.slice(begin + 1, end)
  },
  multipleColumns: function (e) {
    if (!e) return null
    return e.split(',').map(function (o) {
      if (o.slice(0, 1) === '`') {
        o = o.slice(1)

        if (o.indexOf('`') !== -1) {
          o = o.slice(0, o.indexOf('`'))
        }
      }
      return o.trim()
    })
  },
  firstQuoteValue: function (e) {
    if (e.indexOf('`') === -1) return null
    e = e.slice(e.indexOf('`') + 1)
    return e.slice(0, e.indexOf('`'))
  },
  isArrayEqual: function (a, b) {
    if (typeof (a) === typeof (b) === 'string') {
      return a === b
    }

    return a.length && b.length && a.every(function (e, i) { return e === b[i] })
  }
}
