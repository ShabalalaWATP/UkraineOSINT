const dayjs = require('dayjs');

function toUtcStartEnd(startYMD, endYMD) {
  const start = dayjs(startYMD).startOf('day').utc ? dayjs(startYMD).startOf('day').utc() : dayjs(startYMD).startOf('day');
  const end = dayjs(endYMD).endOf('day').utc ? dayjs(endYMD).endOf('day').utc() : dayjs(endYMD).endOf('day');
  return { start, end };
}

function ymd(d) {
  return dayjs(d).format('YYYY-MM-DD');
}

function gdeltTimestamp(d) {
  return dayjs(d).format('YYYYMMDDHHmmss');
}

module.exports = {
  toUtcStartEnd,
  ymd,
  gdeltTimestamp,
};

