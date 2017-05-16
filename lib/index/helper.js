module.exports = {
  innerBrackets: function(e) {
    var begin = e.indexOf('(');
    var end = e.indexOf(')');

    if (begin === -1 || end === -1) return null;
    return e.slice(begin + 1, end);
  },
  multipleColumns: function(e) {
    if (!e) return null;
    return e.split(',').map(function(o) {
      if (o.slice(0, 1) === '`') o = o.slice(1);
      if (o.slice(-1) === '`') o = o.slice(0, -1);
      return o.trim();
    })
  },
  firstQuoteValue: function(e) {
    if (e.indexOf('`') === -1) return null;
    e = e.slice(e.indexOf('`') + 1);
    return e.slice(0, e.indexOf('`'));
  },
  isArrayEqual: function(a, b) {
    return a.length && b.length && a.every(function(e, i) { return e === b[i] })
  }
}
