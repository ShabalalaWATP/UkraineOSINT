const dayjs = require('dayjs');

function ymd(d) {
  return dayjs(d).format('YYYY-MM-DD');
}

function gdeltTimestamp(d) {
  return dayjs(d).format('YYYYMMDDHHmmss');
}

module.exports = {
  ymd,
  gdeltTimestamp,
};
