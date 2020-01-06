// 报告文档中的错误、警告（有修复？？？）
class Reporter {
  constructor(html, ruleset) {
    // html 原文
    this.html = html;
    // 行，正则中对应linux（max）和windows对换行的不同定义，windows中以\r\n视为换行；linux(max)中已\n视为换行
    this.lines = html.split(/\r?\n/);
    var match = html.match(/\r?\n/);
    // 换行数
    this.brLen = match !== null ? match[0].length : 0;
    // 规则集合
    this.ruleset = ruleset;
    // 存储错误和警告的队列
    this.messages = [];

    // 警告、错误都是report，只是类型不同。这里使用bind实现柯里化部分施用
    this.error = this.report.bind(this, 'error');
    this.warn = this.report.bind(this, 'warning');
    this.info = this.report.bind(this, 'info');
  }
  /**
   * 上报错误或警告
   * @param {*} type        信息类型：错误或警告
   * @param {*} message     错误消息
   * @param {*} line        错误行号
   * @param {*} col         错误列号
   * @param {*} rule        错误的规则名
   * @param {*} raw         ???
   */
  report(type, message, line, col, rule, raw) {
    var self = this;
    var lines = self.lines;
    var brLen = self.brLen;
    // 当前行列对应的源码。
    var evidence, evidenceLen;

    // 获取所在行列的源码（考虑col大于当前行总长度的情况）
    for (var i = line - 1, lineCount = lines.length; i < lineCount; i++) {
      // 
      evidence = lines[i];
      evidenceLen = evidence.length;
      if (col > evidenceLen && line < lineCount) {
        line++;
        col -= evidenceLen;
        if (col !== 1) {
          col -= brLen;
        }
      } else {
        break;
      }
    }
    self.messages.push({
      type: type,
      message: message,
      raw: raw,
      evidence: evidence,
      line: line,
      col: col,
      rule: {
        id: rule.id,
        description: rule.description,
        link: 'https://github.com/thedaviddias/HTMLHint/wiki/' + rule.id
      }
    });
  }
}

export default Reporter;
