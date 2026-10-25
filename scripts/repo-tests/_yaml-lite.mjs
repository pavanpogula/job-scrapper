// @ts-check
/**
 * @file _yaml-lite.mjs
 * @summary Indentation-based zero-dependency YAML extractor for GitHub Actions workflow files.
 * @tags repo-tests, yaml, workflow-parser
 */

/**
 * Parses a YAML string into a JS object/array representation suitable for workflow inspection.
 * @param {string} content
 * @returns {any}
 */
export function parseYaml(content) {
  const lines = content.split(/\r?\n/);
  let idx = 0;

  /**
   * @param {number} minIndent
   * @returns {any}
   */
  function parseBlock(minIndent) {
    let result = null;
    let isList = false;

    while (idx < lines.length) {
      const rawLine = lines[idx];
      // Skip empty lines or pure comment lines
      if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
        idx++;
        continue;
      }

      const indent = rawLine.search(/\S/);
      if (indent < minIndent) {
        break;
      }

      const trimmed = rawLine.trim();

      // Check for list item
      if (trimmed.startsWith('- ') || trimmed === '-') {
        if (result === null) {
          result = [];
          isList = true;
        } else if (!isList) {
          break;
        }

        const afterDash = trimmed.slice(1).trim();
        if (!afterDash) {
          // List item with nested content on next lines
          idx++;
          const val = parseBlock(indent + 2);
          result.push(val);
        } else if (afterDash.includes(': ') || afterDash.endsWith(':')) {
          // List of maps, e.g., "- name: foo"
          const firstColon = afterDash.indexOf(':');
          const k = afterDash.slice(0, firstColon).trim();
          let v = afterDash.slice(firstColon + 1).trim();

          const obj = {};
          if (v === '' || v === '|' || v === '>-') {
            idx++;
            if (v === '|' || v === '>-') {
              obj[k] = parseMultiline(indent + 2);
            } else {
              obj[k] = parseBlock(indent + 2);
            }
          } else {
            obj[k] = parseScalar(v);
            idx++;
          }

          // Consume additional keys at same item indent (indent + 2)
          while (idx < lines.length) {
            const nextRaw = lines[idx];
            if (!nextRaw.trim() || nextRaw.trim().startsWith('#')) {
              idx++;
              continue;
            }
            const nextIndent = nextRaw.search(/\S/);
            if (nextIndent <= indent) {
              break;
            }
            const nextTrimmed = nextRaw.trim();
            if (nextTrimmed.startsWith('- ') || nextTrimmed === '-') {
              break;
            }
            if (nextTrimmed.includes(': ') || nextTrimmed.endsWith(':')) {
              const colon = nextTrimmed.indexOf(':');
              const key = nextTrimmed.slice(0, colon).trim();
              let val = nextTrimmed.slice(colon + 1).trim();
              if (val === '' || val === '|' || val === '>-') {
                idx++;
                if (val === '|' || val === '>-') {
                  obj[key] = parseMultiline(nextIndent + 2);
                } else {
                  obj[key] = parseBlock(nextIndent + 2);
                }
              } else {
                obj[key] = parseScalar(val);
                idx++;
              }
            } else {
              idx++;
            }
          }
          result.push(obj);
        } else {
          result.push(parseScalar(afterDash));
          idx++;
        }
        continue;
      }

      // Check for key-value pair
      if (trimmed.includes(': ') || trimmed.endsWith(':')) {
        if (result === null) {
          result = {};
          isList = false;
        } else if (isList) {
          break;
        }

        const colonIdx = trimmed.indexOf(':');
        const key = trimmed.slice(0, colonIdx).trim();
        let valStr = trimmed.slice(colonIdx + 1).trim();

        if (valStr === '' || valStr === '|' || valStr === '>-') {
          idx++;
          if (valStr === '|' || valStr === '>-') {
            result[key] = parseMultiline(indent + 2);
          } else {
            result[key] = parseBlock(indent + 2);
          }
        } else {
          result[key] = parseScalar(valStr);
          idx++;
        }
        continue;
      }

      idx++;
    }

    return result;
  }

  /**
   * @param {number} minIndent
   * @returns {string}
   */
  function parseMultiline(minIndent) {
    const linesCollected = [];
    while (idx < lines.length) {
      const raw = lines[idx];
      if (!raw.trim()) {
        linesCollected.push('');
        idx++;
        continue;
      }
      const indent = raw.search(/\S/);
      if (indent < minIndent) {
        break;
      }
      linesCollected.push(raw.slice(minIndent));
      idx++;
    }
    return linesCollected.join('\n').trim();
  }

  /**
   * @param {string} str
   * @returns {any}
   */
  function parseScalar(str) {
    const s = str.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null' || s === '~') return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
      return s.slice(1, -1);
    }
    return s;
  }

  return parseBlock(0) || {};
}
