// 对html源码做词法分析，生成AST树，并对树遍历暴露出各种事件供rule消费
// 注意：全部是正则匹配，没有状态机模式
// 是一个事件hub，供rule注册消费
class HTMLParser {
  constructor() {
    // 保存监听的事件，是一个Record<string, Funciton[]>
    this._listeners = {};
    this._mapCdataTags = this.makeMap('script,style');
    // 缓存识别的块数据
    this._arrBlocks = [];
    this.lastEvent = null;
  }
  // 字符串转map，用于缓存
  makeMap(str) {
    var obj = {},
      items = str.split(',');
    for (var i = 0; i < items.length; i++) {
      obj[items[i]] = true;
    }
    return obj;
  }
  // 入口函数
  parse(html) {
    var self = this,
      mapCdataTags = self._mapCdataTags;

    // 标签、属性的正则
    // \/([^\s>]+)\s* 结束标签
    // !--([\s\S]*?)-- 注释
    // ![^>]* <!?>  <!*
    // ([\w\-:]+)((?:\s+[^\s"'>\/=\x00-\x0F\x7F\x80-\x9F]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]*))?)*?)\s*(\/?)  开始标签
    var regTag = /<(?:\/([^\s>]+)\s*|!--([\s\S]*?)--|!([^>]*?)|([\w\-:]+)((?:\s+[^\s"'>\/=\x00-\x0F\x7F\x80-\x9F]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]*))?)*?)\s*(\/?))>/g,
      regAttr = /\s*([^\s"'>\/=\x00-\x0F\x7F\x80-\x9F]+)(?:\s*=\s*(?:(")([^"]*)"|(')([^']*)'|([^\s"'>]*)))?/g,
      regLine = /\r?\n/g;

    var match,
      matchIndex,
      // 当前索引
      lastIndex = 0,
      // 缓存当前标签名
      tagName,
      // 缓存属性
      arrAttrs,
      // 是否处于cdata中
      tagCDATA,
      attrsCDATA,
      arrCDATA,
      lastCDATAIndex = 0,
      text;
    var lastLineIndex = 0,
      line = 1;
    var arrBlocks = self._arrBlocks;

    // 开始 pares 事件
    self.fire('start', {
      pos: 0,
      line: 1,
      col: 1
    });

    // 保存识别的块数据
    function saveBlock(type, raw, pos, data) {
      var col = pos - lastLineIndex + 1;
      if (data === undefined) {
        data = {};
      }
      data.raw = raw;
      data.pos = pos;
      data.line = line;
      data.col = col;
      arrBlocks.push(data);
      // 触发对应块的识别事件
      self.fire(type, data);
      var lineMatch;
      // 更新行列号
      while ((lineMatch = regLine.exec(raw))) {
        line++;
        lastLineIndex = pos + regLine.lastIndex;
      }
    }

    // scan，使用正则查找开始标签、结束标签、注释
    while ((match = regTag.exec(html))) {
      matchIndex = match.index;
      // 找到了内容，当前索引到内容开始处的视为文本
      if (matchIndex > lastIndex) {
        // Save the previous text or CDATA
        text = html.substring(lastIndex, matchIndex);
        // 排查CDATA影响
        if (tagCDATA) {
          arrCDATA.push(text);
        } else {
          // text
          saveBlock('text', text, lastIndex);
        }
      }
      lastIndex = regTag.lastIndex;

      if ((tagName = match[1])) {
        if (tagCDATA && tagName === tagCDATA) {
          // Output CDATA before closing the label
          text = arrCDATA.join('');
          saveBlock('cdata', text, lastCDATAIndex, {
            tagName: tagCDATA,
            attrs: attrsCDATA
          });
          tagCDATA = null;
          attrsCDATA = null;
          arrCDATA = null;
        }
        if (!tagCDATA) {
          // End of label
          saveBlock('tagend', match[0], matchIndex, {
            tagName: tagName
          });
          continue;
        }
      }

      if (tagCDATA) {
        arrCDATA.push(match[0]);
      } else {
        // 开始标签
        if ((tagName = match[4])) {
          // Label start
          // 情况属性数组
          arrAttrs = [];
          var attrs = match[5],
            attrMatch,
            attrMatchCount = 0;
          // 识别属性
          while ((attrMatch = regAttr.exec(attrs))) {
            var name = attrMatch[1],
              quote = attrMatch[2]
                ? attrMatch[2]
                : attrMatch[4]
                  ? attrMatch[4]
                  : '',
              value = attrMatch[3]
                ? attrMatch[3]
                : attrMatch[5]
                  ? attrMatch[5]
                  : attrMatch[6]
                    ? attrMatch[6]
                    : '';
            arrAttrs.push({
              name: name,
              value: value,
              quote: quote,
              index: attrMatch.index,
              raw: attrMatch[0]
            });
            attrMatchCount += attrMatch[0].length;
          }
          // 如果属性总不等于attrs，说明有异常的字符？？？？？
          if (attrMatchCount === attrs.length) {
            saveBlock('tagstart', match[0], matchIndex, {
              tagName: tagName,
              attrs: arrAttrs,
              close: match[6]
            });
            if (mapCdataTags[tagName]) {
              tagCDATA = tagName;
              attrsCDATA = arrAttrs.concat();
              arrCDATA = [];
              lastCDATAIndex = lastIndex;
            }
          } else {
            // ？？？？
            // If a miss match occurs, the current content is matched to text
            saveBlock('text', match[0], matchIndex);
          }
        } else if (match[2] || match[3]) {
          // 注释情况
          // Comment tag
          saveBlock('comment', match[0], matchIndex, {
            content: match[2] || match[3],
            long: match[2] ? true : false
          });
        }
      }
    }

    // 如果有剩余的代码未匹配到，全部按照text匹配
    if (html.length > lastIndex) {
      // End text
      text = html.substring(lastIndex, html.length);
      saveBlock('text', text, lastIndex);
    }


    // pares结束
    self.fire('end', {
      pos: lastIndex,
      line: line,
      col: html.length - lastLineIndex + 1
    });
  }

  // 注册事件
  addListener(types, listener) {
    var _listeners = this._listeners;
    var arrTypes = types.split(/[,\s]/),
      type;
    for (var i = 0, l = arrTypes.length; i < l; i++) {
      type = arrTypes[i];
      if (_listeners[type] === undefined) {
        _listeners[type] = [];
      }
      _listeners[type].push(listener);
    }
  }

  // emit 事件
  fire(type, data) {
    if (data === undefined) {
      data = {};
    }
    data.type = type;
    var self = this,
      listeners = [],
      listenersType = self._listeners[type],
      listenersAll = self._listeners['all'];
    if (listenersType !== undefined) {
      listeners = listeners.concat(listenersType);
    }
    if (listenersAll !== undefined) {
      listeners = listeners.concat(listenersAll);
    }
    var lastEvent = self.lastEvent;
    if (lastEvent !== null) {
      delete lastEvent['lastEvent'];
      data.lastEvent = lastEvent;
    }
    self.lastEvent = data;
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].call(self, data);
    }
  }

  // 移除事件监听
  removeListener(type, listener) {
    var listenersType = this._listeners[type];
    if (listenersType !== undefined) {
      for (var i = 0, l = listenersType.length; i < l; i++) {
        if (listenersType[i] === listener) {
          listenersType.splice(i, 1);
          break;
        }
      }
    }
  }
  fixPos(event, index) {
    var text = event.raw.substr(0, index);
    var arrLines = text.split(/\r?\n/),
      lineCount = arrLines.length - 1,
      line = event.line,
      col;
    if (lineCount > 0) {
      line += lineCount;
      col = arrLines[lineCount].length + 1;
    } else {
      col = event.col + index;
    }
    return {
      line: line,
      col: col
    };
  }

  // 属性数据数组，转为属性map，增加检索效率，同时去重
  getMapAttrs(arrAttrs) {
    var mapAttrs = {},
      attr;
    for (var i = 0, l = arrAttrs.length; i < l; i++) {
      attr = arrAttrs[i];
      mapAttrs[attr.name] = attr.value;
    }
    return mapAttrs;
  }
}

export default HTMLParser;