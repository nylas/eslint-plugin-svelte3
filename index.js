'use strict';

// get the total length, number of lines, and length of the last line of a string
const get_offsets = (str) => {
  const { length } = str;
  let lines = 1;
  let last = 0;
  for (let i = 0; i < length; i++) {
    if (str[i] === "\n") {
      lines++;
      last = 0;
    } else {
      last++;
    }
  }
  return { length, lines, last };
};

// dedent a script block, and get offsets necessary to later adjust linting messages about the block
const dedent_code = (str) => {
  let indentation = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "\n" || char === "\r") {
      indentation = "";
    } else if (char === " " || char === "\t") {
      indentation += str[i];
    } else {
      break;
    }
  }
  const { length } = indentation;
  let dedented = "";
  const offsets = [];
  const total_offsets = [0];
  for (let i = 0; i < str.length; i++) {
    if (i === 0 || str[i - 1] === "\n") {
      if (str.slice(i, i + length) === indentation) {
        i += length;
        offsets.push(length);
      } else {
        offsets.push(0);
      }
      total_offsets.push(
        total_offsets[total_offsets.length - 1] + offsets[offsets.length - 1]
      );
      if (i >= str.length) {
        break;
      }
    }
    dedented += str[i];
  }
  return { dedented, offsets: { offsets, total_offsets } };
};

// get character offsets of each line in a string
const get_line_offsets$1 = (str) => {
  const offsets = [-1];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\n") {
      offsets.push(i);
    }
  }
  return offsets;
};

const pad = (times) => {
  return Array.from({ length: times }, () => "\n").join("");
};

const closingTagLength = new Proxy(
  {
    Head: 14,
    Options: 17
  },
  {
    get(source, name) {
      return source[name] || name.length - 2;
    },
  }
);

function getInjectOrder(asts) {
  return asts.sort((a, b) => a.start - b.start);
}

function findGaps(nodes, text) {
  return nodes.reduce((mem, c, i, a) => {
    if (a[i - 1]) {
      if (a[i - 1].end !== c.start) {
        c.inject = "before";
      }
    } else {
      if (c.start) {
        c.inject = "before";
      }
    }
    if (a[i + 1]) {
      if (a[i + 1].start !== c.end) {
        c.inject = "after";
      }
    } else {
      if (c.end !== text.length - 1) {
        c.inject = "before";
      }
    }
    if (c.inject && !mem.includes(a[i - 1]) && !mem.includes(a[i + 1])) {
      mem.push(c);
    }
    return mem;
  }, []);
}

function padCodeWithMissingNodesLines(ast, text) {
  if (!ast.html || !ast.html.children || !ast.html.children.length) {
    return;
  }
  if (!ast.instance && !ast.module && !ast.css) {
    return;
  }
  const injectOrder = getInjectOrder([ast.instance, ast.module, ast.css].filter(_ => _));
  // pad html block so we map 1<->1

  const textNodes = findGaps(ast.html.children, text);
  injectOrder.forEach((node, i) => {
    let textNode = textNodes[i] || textNodes[textNodes.length - 1];

    if (textNode.inject === "after") {
      textNode.raw += pad(
          get_offsets(text.slice(node.start, node.end)).lines - 1
      );
    }

    if (textNode.inject === "before") {
      textNode.raw =
          pad(get_offsets(text.slice(node.start, node.end)).lines - 1) +
          textNode.raw;
    }
  });
}

function replaceWithWhitespaces(text, node) {
  if (!text || !node) {
    return '';
  }
  return text.slice(
      node.start,
      node.end
  ).replace(/\S/g, ' ')
}

// return a new block
const new_block = () => ({
  transformed_code: "",
  line_offsets: null,
  translations: new Map(),
});

// get translation info and include the processed scripts in this block's transformed_code
const get_translation = (text, block, node, options = {}) => {
  block.transformed_code += "\n";
  const translation = {
    options,
    unoffsets: get_offsets(block.transformed_code),
  };
  translation.range = [node.start, node.end];
  const { dedented, offsets } = dedent_code(text.slice(node.start, node.end));
  block.transformed_code += dedented;
  translation.offsets = get_offsets(text.slice(0, node.start));
  translation.dedent = offsets;
  translation.end = get_offsets(block.transformed_code).lines;
  for (let i = translation.unoffsets.lines; i <= translation.end; i++) {
    block.translations.set(i, translation);
  }
  block.transformed_code += "\n";
};

const nullProxy = new Proxy(
    {},
    {
      get(target, p, receiver) {
        return 0;
      },
    }
);

const get_template_translation = (text, block, ast) => {
  const codeOffsets = get_offsets(text);

  const translation = {
    options: {},
    start: 0,
    end: codeOffsets.lines,
    unoffsets: { length: 0, lines: 1, last: 0 },
    dedent: {
      offsets: nullProxy,
      total_offsets: nullProxy,
    },
    offsets: { length: 0, lines: 1, last: 0 },
    range: [0, text.length - 1]
  };

  for (let i = translation.start; i <= translation.end; i++) {
    translation.options.template = i > 0;
    block.translations.set(i, translation);
  }
};

const processor_options = {};

// find Linter instance
const linter_paths = Object.keys(require.cache).filter(path => path.endsWith('/eslint/lib/linter/linter.js') || path.endsWith('\\eslint\\lib\\linter\\linter.js'));
if (!linter_paths.length) {
	throw new Error('Could not find ESLint Linter in require cache');
}
// There may be more than one instance of the linter when we're in a workspace with multiple directories.
// We first try to find the one that's inside the same node_modules directory as this plugin.
// If that can't be found for some reason, we assume the one we want is the last one in the array.
const current_node_modules_path = __dirname.replace(/(?<=[/\\]node_modules[/\\]).*$/, '');
const linter_path = linter_paths.find(path => path.startsWith(current_node_modules_path)) || linter_paths.pop();
const { Linter } = require(linter_path);

// patch Linter#verify
const { verify } = Linter.prototype;
Linter.prototype.verify = function(code, config, options) {
	// fetch settings
	const settings = config && (typeof config.extractConfig === 'function' ? config.extractConfig(options.filename) : config).settings || {};
	processor_options.custom_compiler = settings['svelte3/compiler'];
	processor_options.ignore_warnings = settings['svelte3/ignore-warnings'];
	processor_options.ignore_styles = settings['svelte3/ignore-styles'];
	processor_options.compiler_options = settings['svelte3/compiler-options'];
	processor_options.named_blocks = settings['svelte3/named-blocks'];
	processor_options.typescript =
		settings['svelte3/typescript'] === true
			? require('typescript')
			: typeof settings['svelte3/typescript'] === 'function'
				? settings['svelte3/typescript']()
				: settings['svelte3/typescript'];
	// call original Linter#verify
	return verify.call(this, code, config, options);
};

let state;
const reset = () => {
	state = {
		messages: null,
		var_names: null,
		blocks: new Map(),
	};
};
reset();

var charToInteger = {};
var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
for (var i = 0; i < chars.length; i++) {
    charToInteger[chars.charCodeAt(i)] = i;
}
function decode(mappings) {
    var decoded = [];
    var line = [];
    var segment = [
        0,
        0,
        0,
        0,
        0,
    ];
    var j = 0;
    for (var i = 0, shift = 0, value = 0; i < mappings.length; i++) {
        var c = mappings.charCodeAt(i);
        if (c === 44) { // ","
            segmentify(line, segment, j);
            j = 0;
        }
        else if (c === 59) { // ";"
            segmentify(line, segment, j);
            j = 0;
            decoded.push(line);
            line = [];
            segment[0] = 0;
        }
        else {
            var integer = charToInteger[c];
            if (integer === undefined) {
                throw new Error('Invalid character (' + String.fromCharCode(c) + ')');
            }
            var hasContinuationBit = integer & 32;
            integer &= 31;
            value += integer << shift;
            if (hasContinuationBit) {
                shift += 5;
            }
            else {
                var shouldNegate = value & 1;
                value >>>= 1;
                if (shouldNegate) {
                    value = value === 0 ? -0x80000000 : -value;
                }
                segment[j] += value;
                j++;
                value = shift = 0; // reset
            }
        }
    }
    segmentify(line, segment, j);
    decoded.push(line);
    return decoded;
}
function segmentify(line, segment, j) {
    // This looks ugly, but we're creating specialized arrays with a specific
    // length. This is much faster than creating a new array (which v8 expands to
    // a capacity of 17 after pushing the first item), or slicing out a subarray
    // (which is slow). Length 4 is assumed to be the most frequent, followed by
    // length 5 (since not everything will have an associated name), followed by
    // length 1 (it's probably rare for a source substring to not have an
    // associated segment data).
    if (j === 4)
        line.push([segment[0], segment[1], segment[2], segment[3]]);
    else if (j === 5)
        line.push([segment[0], segment[1], segment[2], segment[3], segment[4]]);
    else if (j === 1)
        line.push([segment[0]]);
}

class GeneratedFragmentMapper {
	constructor(generated_code, diff) {
		this.generated_code = generated_code;
		this.diff = diff;
	}

	get_position_relative_to_fragment(position_relative_to_file) {
		const fragment_offset = this.offset_in_fragment(offset_at(position_relative_to_file, this.generated_code));
		return position_at(fragment_offset, this.diff.generated_content);
	}

	offset_in_fragment(offset) {
		return offset - this.diff.generated_start
	}
}

class OriginalFragmentMapper {
	constructor(original_code, diff) {
		this.original_code = original_code;
		this.diff = diff;
	}

	get_position_relative_to_file(position_relative_to_fragment) {
		const parent_offset = this.offset_in_parent(offset_at(position_relative_to_fragment, this.diff.original_content));
		return position_at(parent_offset, this.original_code);
	}

	offset_in_parent(offset) {
		return this.diff.original_start + offset;
	}
}

class SourceMapper {
	constructor(raw_source_map) {
		this.raw_source_map = raw_source_map;
	}

	get_original_position(generated_position) {
		if (generated_position.line < 0) {
			return { line: -1, column: -1 };
		}

		// Lazy-load
		if (!this.decoded) {
			this.decoded = decode(JSON.parse(this.raw_source_map).mappings);
		}

		let line = generated_position.line;
		let column = generated_position.column;

		let line_match = this.decoded[line];
		while (line >= 0 && (!line_match || !line_match.length)) {
			line -= 1;
			line_match = this.decoded[line];
			if (line_match && line_match.length) {
				return {
					line: line_match[line_match.length - 1][2],
					column: line_match[line_match.length - 1][3]
				};
			}
		}

		if (line < 0) {
			return { line: -1, column: -1 };
		}

		const column_match = line_match.find((col, idx) =>
			idx + 1 === line_match.length ||
			(col[0] <= column && line_match[idx + 1][0] > column)
		);

		return {
			line: column_match[2],
			column: column_match[3],
		};
	}
}

class DocumentMapper {
	constructor(original_code, generated_code, diffs) {
		this.original_code = original_code;
		this.generated_code = generated_code;
		this.diffs = diffs;
		this.mappers = diffs.map(diff => {
			return {
				start: diff.generated_start,
				end: diff.generated_end,
				diff: diff.diff,
				generated_fragment_mapper: new GeneratedFragmentMapper(generated_code, diff),
				source_mapper: new SourceMapper(diff.map),
				original_fragment_mapper: new OriginalFragmentMapper(original_code, diff)
			}
		});
	}

	get_original_position(generated_position) {
		generated_position = { line: generated_position.line - 1, column: generated_position.column };
		const offset = offset_at(generated_position, this.generated_code);
		let original_offset = offset;
		for (const mapper of this.mappers) {
			if (offset >= mapper.start && offset <= mapper.end) {
				return this.map(mapper, generated_position);
			}
			if (offset > mapper.end) {
				original_offset -= mapper.diff;
			}
		}
		const original_position = position_at(original_offset, this.original_code);
		return this.to_ESLint_position(original_position);
	}

	map(mapper, generated_position) {
		// Map the position to be relative to the transpiled fragment
		const position_in_transpiled_fragment = mapper.generated_fragment_mapper.get_position_relative_to_fragment(
			generated_position
		);
		// Map the position, using the sourcemap, to the original position in the source fragment
		const position_in_original_fragment = mapper.source_mapper.get_original_position(
			position_in_transpiled_fragment
		);
		// Map the position to be in the original fragment's parent
		const original_position = mapper.original_fragment_mapper.get_position_relative_to_file(position_in_original_fragment);
		return this.to_ESLint_position(original_position);
	}

	to_ESLint_position(position) {
		// ESLint line/column is 1-based
		return { line: position.line + 1, column: position.column + 1 };
	}

}

/**
 * Get the offset of the line and character position
 * @param position Line and character position
 * @param text The text for which the offset should be retrieved
 */
function offset_at(position, text) {
	const line_offsets = get_line_offsets(text);

	if (position.line >= line_offsets.length) {
		return text.length;
	} else if (position.line < 0) {
		return 0;
	}

	const line_offset = line_offsets[position.line];
	const next_line_offset =
		position.line + 1 < line_offsets.length ? line_offsets[position.line + 1] : text.length;

	return clamp(next_line_offset, line_offset, line_offset + position.column);
}

function position_at(offset, text) {
	offset = clamp(offset, 0, text.length);

	const line_offsets = get_line_offsets(text);
	let low = 0;
	let high = line_offsets.length;
	if (high === 0) {
		return { line: 0, column: offset };
	}

	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (line_offsets[mid] > offset) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	// low is the least x for which the line offset is larger than the current offset
	// or array.length if no line offset is larger than the current offset
	const line = low - 1;
	return { line, column: offset - line_offsets[line] };
}

function get_line_offsets(text) {
	const line_offsets = [];
	let is_line_start = true;

	for (let i = 0; i < text.length; i++) {
		if (is_line_start) {
			line_offsets.push(i);
			is_line_start = false;
		}
		const ch = text.charAt(i);
		is_line_start = ch === '\r' || ch === '\n';
		if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
			i++;
		}
	}

	if (is_line_start && text.length > 0) {
		line_offsets.push(text.length);
	}

	return line_offsets;
}

function clamp(num, min, max) {
	return Math.max(min, Math.min(max, num));
}

let default_compiler;

// find the contextual name or names described by a particular node in the AST
const contextual_names = [];
const find_contextual_names = (compiler, node) => {
  if (node) {
    if (typeof node === "string") {
      contextual_names.push(node);
    } else if (typeof node === "object") {
      compiler.walk(node, {
        enter(node, parent, prop) {
          if (node.name && prop !== "key") {
            contextual_names.push(node.name);
          }
        },
      });
    }
  }
};

// extract scripts to lint from component definition
const preprocess = (text) => {
  const compiler =
    processor_options.custom_compiler ||
    default_compiler ||
    (default_compiler = require("svelte/compiler"));
  if (processor_options.ignore_styles) {
    // wipe the appropriate <style> tags in the file
    text = text.replace(
      /<style(\s[^]*?)?>([^]*?)<\/style>/gi,
      (match, attributes = "", content) => {
        const attrs = {};
        attributes
          .split(/\s+/)
          .filter(Boolean)
          .forEach((attr) => {
            const p = attr.indexOf("=");
            if (p === -1) {
              attrs[attr] = true;
            } else {
              attrs[attr.slice(0, p)] = "'\"".includes(attr[p + 1])
                ? attr.slice(p + 2, -1)
                : attr.slice(p + 1);
            }
          });
        return processor_options.ignore_styles(attrs)
          ? `<style${attributes}>${content.replace(/\S/g, " ")}</style>`
          : match;
      }
    );
  }

  // get information about the component
  let result;
  try {
    result = compile_code(text, compiler, processor_options);
  } catch ({ name, message, start, end }) {
    // convert the error to a linting message, store it, and return
    state.messages = [
      {
        ruleId: name,
        severity: 2,
        message,
        line: start && start.line,
        column: start && start.column + 1,
        endLine: end && end.line,
        endColumn: end && end.column + 1,
      },
    ];
    return [];
  }
  const { ast, warnings, vars, mapper } = result;

  padCodeWithMissingNodesLines(ast, text);

  const references_and_reassignments = `{${vars
    .filter((v) => v.referenced || v.name[0] === "$")
    .map((v) => v.name)};${vars
    .filter((v) => v.reassigned || v.export_name)
    .map((v) => v.name + "=0")}}`;
  state.var_names = new Set(vars.map((v) => v.name));

  // convert warnings to linting messages
  const filtered_warnings = processor_options.ignore_warnings
    ? warnings.filter((warning) => !processor_options.ignore_warnings(warning))
    : warnings;
  state.messages = filtered_warnings.map(({ code, message, start, end }) => {
    const start_pos =
      processor_options.typescript && start
        ? mapper.get_original_position(start)
        : start && { line: start.line, column: start.column + 1 };
    const end_pos =
      processor_options.typescript && end
        ? mapper.get_original_position(end)
        : end && { line: end.line, column: end.column + 1 };
    return {
      ruleId: code,
      severity: 1,
      message,
      line: start_pos && start_pos.line,
      column: start_pos && start_pos.column,
      endLine: end_pos && end_pos.line,
      endColumn: end_pos && end_pos.column,
    };
  });

  // build strings that we can send along to ESLint to get the remaining messages

  // Things to think about:
  // - not all Svelte files may be typescript -> do we need a distinction on a file basis by analyzing the attribute + a config option to tell "treat all as TS"?
  const with_file_ending = (filename) =>
    `${filename}${processor_options.typescript ? ".ts" : ".js"}`;

  if (ast.module) {
    // block for <script context='module'>
    const block = new_block();
    state.blocks.set(with_file_ending("module"), block);

    get_translation(text, block, ast.module.content);

    if (ast.instance) {
      block.transformed_code += text.slice(
        ast.instance.content.start,
        ast.instance.content.end
      );
    }

    block.transformed_code += references_and_reassignments;
  }

  if (ast.instance) {
    // block for <script context='instance'>
    const block = new_block();
    state.blocks.set(with_file_ending("instance"), block);

    if (ast.module && processor_options.typescript) {
      block.transformed_code = vars
        .filter((v) => v.injected)
        .map((v) => `let ${v.name};`)
        .join("");
      block.transformed_code += text.slice(
        ast.module.content.start,
        ast.module.content.end
      );
    } else {
      block.transformed_code = vars
        .filter((v) => v.injected || v.module)
        .map((v) => `let ${v.name};`)
        .join("");
    }

    get_translation(text, block, ast.instance.content);

    block.transformed_code += references_and_reassignments;
  }

  if (ast.html) {
    // block for template
    const block = new_block();
    state.blocks.set(with_file_ending("template"), block);

    const htmlBlock = new_block();

    htmlBlock.transformed_code += "(";

    if (processor_options.typescript) {
      block.transformed_code = "";
      if (ast.module) {
        block.transformed_code += text.slice(
          ast.module.content.start,
          ast.module.content.end
        );
      }
      if (ast.instance) {
        block.transformed_code += "\n";
        block.transformed_code += vars
          .filter((v) => v.injected)
          .map((v) => `let ${v.name};`)
          .join("");
        block.transformed_code += text.slice(
          ast.instance.content.start,
          ast.instance.content.end
        );
      }
    } else {
      block.transformed_code = vars.map((v) => `let ${v.name};`).join("");
    }

    const nodes_with_contextual_scope = new WeakSet();
    let in_quoted_attribute = false;
    compiler.walk(ast.html, {
      enter(node, parent, prop) {
        if (prop === "expression") {
          return this.skip();
        } else if (
          prop === "attributes" &&
          "'\"".includes(text[node.end - 1])
        ) {
          in_quoted_attribute = true;
        }
        contextual_names.length = 0;
        find_contextual_names(compiler, node.context);
        if (node.type === "EachBlock") {
          find_contextual_names(compiler, node.index);
        } else if (node.type === "ThenBlock") {
          find_contextual_names(compiler, parent.value);
        } else if (node.type === "CatchBlock") {
          find_contextual_names(compiler, parent.error);
        } else if (node.type === "Element" || node.type === "InlineComponent") {
          node.attributes.forEach(
            (node) =>
              node.type === "Let" &&
              find_contextual_names(compiler, node.expression || node.name)
          );
        }
        if (contextual_names.length) {
          nodes_with_contextual_scope.add(node);
          block.transformed_code += `{let ${contextual_names
            .map((name) => `${name}=0`)
            .join(",")};`;
        }
        if (node.expression && typeof node.expression === "object") {
          // add the expression in question to the constructed string
          block.transformed_code += "(";
          get_translation(text, block, node.expression, {
            template: true,
            in_quoted_attribute,
          });
          block.transformed_code += ");";
        }

        switch (node.type) {
          case "InlineComponent":
          case "Title":
          case "Element": {
            htmlBlock.transformed_code += `<${
              node.name && node.name.replace(":", "-")
            }`;
            if (node.attributes && node.attributes.length) {
              htmlBlock.transformed_code += text.slice(
                node.start + 1 + node.name.length,
                node.attributes[0].start
              );
              htmlBlock.transformed_code += node.attributes
                .map((attr, i) => {
                  function getString() {
                    switch (attr.type) {
                      case "EventHandler": {
                        return `on${attr.name}${
                          attr.modifiers.join("") || ""
                        }="${replaceWithWhitespaces(text, attr.expression)}"`;
                      }
                      case "Class":
                      case "Binding":
                      case "Action":
                      case "Spread":
                      case "Animation":
                      case "Let":
                      case "Transition": {
                        return `data-${attr.type.toLowerCase()}-${
                          attr.name || ""
                        }="${replaceWithWhitespaces(text, attr.expression)}"`;
                      }
                      case "Attribute": {
                        if (
                          attr.value &&
                          attr.value.length &&
                          attr.value[0].type !== "Text"
                        ) {
                          return attr.name;
                        }
                        return `${text.slice(attr.start, attr.end)}`;
                      }
                      default: {
                        console.log(attr.type);
                      }
                    }
                  }
                  let str = getString();
                  if (i + 1 < node.attributes.length) {
                    str += text.slice(attr.end, node.attributes[i + 1].start);
                  }
                  return str;
                })
                .join("");
            }
            htmlBlock.transformed_code += ">";
            break;
          }
          case "Comment":
          case "Text": {
            if (parent.type === "Attribute") {
              break;
            }
            htmlBlock.transformed_code +=
              node.raw || replaceWithWhitespaces(text, node);
            break;
          }
          case "Slot":
          case "MustacheTag": {
            htmlBlock.transformed_code += replaceWithWhitespaces(text, node);
            break;
          }
          case "EachBlock": {
            // {#each} -> <each>
            htmlBlock.transformed_code += `<${
              node.name || node.type.toLowerCase().replace("block", "")
            }>`;
            if (node.children && node.children.length) {
              let eachEndsAt = node.children[0].start - 1;

              while (text[eachEndsAt] && text[eachEndsAt] !== "}") {
                eachEndsAt--;
              }

              if (text[eachEndsAt] === "}") {
                htmlBlock.transformed_code += text.slice(
                  eachEndsAt + 1,
                  node.children[0].start
                );
              }
            }
            break;
          }

          case "ElseBlock":
          case "ThenBlock":
          case "CatchBlock": {
            if (node.type === 'ElseBlock' && node.children && node.children.length) {
              let child = node.children[0];
              if (
                child.type === "IfBlock" &&
                node.start === child.start &&
                child.children &&
                child.children.length
              ) {
                child = child.children[0];
              }
              htmlBlock.transformed_code += text.slice(node.start, child.start);
            }
            htmlBlock.transformed_code += `<${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }/>`;
            if (node.children && node.children.length) {
              if (node.expression) {
                htmlBlock.transformed_code += text.slice(
                  node.expression.end + 1,
                  node.children[0].start
                );
              } else {
                htmlBlock.transformed_code += text.slice(
                  node.children[node.children.length - 1].end,
                  node.end
                );
              }
            }
            break;
          }
          case "Head":
          case "Options":
          case "IfBlock":
          case "AwaitBlock": {
            // {#if} -> <if>
            htmlBlock.transformed_code += `<${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }>`;
            if (node.expression && node.children && node.children.length) {
              htmlBlock.transformed_code += text.slice(
                node.expression.end + 1,
                node.children[0].start
              );
            }
            break;
          }
          case "Fragment": {
            htmlBlock.transformed_code += "<>";
            break;
          }
        }
      },
      leave(node, parent, prop) {
        if (prop === "attributes") {
          in_quoted_attribute = false;
        }
        // close contextual scope
        if (nodes_with_contextual_scope.has(node)) {
          block.transformed_code += "}";
        }

        switch (node.type) {
          case "Head":
          case "Options":
          case "EachBlock":
          case "IfBlock":
          case "AwaitBlock": {
            if (node.children && node.children.length) {
              let sliceFrom = node.children[node.children.length - 1].end;

              if (node.else) {
                sliceFrom = node.else.end;
              }
              htmlBlock.transformed_code += text.slice(
                sliceFrom,
                node.end - closingTagLength[node.type]
              );
            }
            htmlBlock.transformed_code += `</${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }>`;
            break;
          }
          case "InlineComponent":
          case "Title":
          case "Element": {
            htmlBlock.transformed_code += `</${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }>`;
            break;
          }
          case "Fragment": {
            htmlBlock.transformed_code += "</>";
            break;
          }
          case "ElseBlock":
          case "ThenBlock":
          case "CatchBlock": {
            if (node.children && node.children.length) {
              htmlBlock.transformed_code += text.slice(
                node.children[node.children.length - 1].end,
                node.end
              );
            }
            break;
          }
        }
      },
    });

    htmlBlock.transformed_code += ");";

    if (htmlBlock.transformed_code.match(/\(<>(\s+)?<\/>\);/gm)) {
      htmlBlock.transformed_code = "";
    }
    if (htmlBlock.transformed_code) {
      state.blocks.set(
        `svelte${processor_options.typescript ? ".t" : ".j"}sx`,
        htmlBlock
      );
    }
    get_template_translation(text, htmlBlock);

    block.transformed_code += `{${vars
      .filter((v) => v.referenced_from_script || v.name[0] === "$")
      .map((v) => v.name)}}`;
  }

  // return processed string
  return [...state.blocks].map(([filename, { transformed_code: text }]) =>
    processor_options.named_blocks ? { text, filename } : text
  );
};

// https://github.com/sveltejs/svelte-preprocess/blob/main/src/transformers/typescript.ts
// TypeScript transformer for preserving imports correctly when preprocessing TypeScript files
const ts_import_transformer = (context) => {
  const ts = processor_options.typescript;
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause && node.importClause.isTypeOnly) {
        return ts.createEmptyStatement();
      }

      return ts.createImportDeclaration(
        node.decorators,
        node.modifiers,
        node.importClause,
        node.moduleSpecifier
      );
    }

    return ts.visitEachChild(node, (child) => visit(child), context);
  };

  return (node) => ts.visitNode(node, visit);
};

// How it works for JS:
// 1. compile code
// 2. return ast/vars/warnings
// How it works for TS:
// 1. transpile script contents from TS to JS
// 2. compile result to get Svelte compiler warnings and variables
// 3. provide a mapper to map those warnings back to its original positions
// 4. blank script contents
// 5. parse the source to get the AST
// 6. return AST of step 5, warnings and vars of step 2
function compile_code(text, compiler, processor_options) {
  const ts = processor_options.typescript;
  if (!ts) {
    return compiler.compile(text, {
      generate: false,
      ...processor_options.compiler_options,
    });
  } else {
    const diffs = [];
    let accumulated_diff = 0;
    const transpiled = text.replace(
      /<script(\s[^]*?)?>([^]*?)<\/script>/gi,
      (match, attributes = "", content) => {
        const output = ts.transpileModule(content, {
          reportDiagnostics: false,
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
            sourceMap: true,
          },
          transformers: {
            before: [ts_import_transformer],
          },
        });
        const original_start = text.indexOf(content);
        const generated_start = accumulated_diff + original_start;
        accumulated_diff += output.outputText.length - content.length;
        diffs.push({
          original_start: original_start,
          generated_start: generated_start,
          generated_end: generated_start + output.outputText.length,
          diff: output.outputText.length - content.length,
          original_content: content,
          generated_content: output.outputText,
          map: output.sourceMapText,
        });
        return `<script${attributes}>${output.outputText}</script>`;
      }
    );
    const mapper = new DocumentMapper(text, transpiled, diffs);

    let ts_result;
    try {
      ts_result = compiler.compile(transpiled, {
        generate: false,
        ...processor_options.compiler_options,
      });
    } catch (err) {
      // remap the error to be in the correct spot and rethrow it
      err.start = mapper.get_original_position(err.start);
      err.end = mapper.get_original_position(err.end);
      throw err;
    }

    text = text.replace(
      /<script(\s[^]*?)?>([^]*?)<\/script>/gi,
      (match, attributes = "", content) => {
        return `<script${attributes}>${content
          // blank out the content
          .replace(/[^\n]/g, " ")
          // excess blank space can make the svelte parser very slow (sec->min). break it up with comments (works in style/script)
          .replace(/[^\n][^\n][^\n][^\n]\n/g, "/**/\n")}</script>`;
      }
    );
    // if we do a full recompile Svelte can fail due to the blank script tag not declaring anything
    // so instead we just parse for the AST (which is likely faster, anyways)
    const ast = compiler.parse(text, { ...processor_options.compiler_options });
    const { warnings, vars } = ts_result;
    return { ast, warnings, vars, mapper };
  }
}

// transform a linting message according to the module/instance script info we've gathered
const transform_message = ({ transformed_code }, { unoffsets, dedent, offsets, range }, message) => {
	// strip out the start and end of the fix if they are not actually changes
	if (message.fix) {
		while (message.fix.range[0] < message.fix.range[1] && transformed_code[message.fix.range[0]] === message.fix.text[0]) {
			message.fix.range[0]++;
			message.fix.text = message.fix.text.slice(1);
		}
		while (message.fix.range[0] < message.fix.range[1] && transformed_code[message.fix.range[1] - 1] === message.fix.text[message.fix.text.length - 1]) {
			message.fix.range[1]--;
			message.fix.text = message.fix.text.slice(0, -1);
		}
	}
	// shift position reference backward according to unoffsets
	{
		const { length, lines, last } = unoffsets;
		if (message.line === lines) {
			message.column -= last;
		}
		if (message.endColumn && message.endLine === lines) {
			message.endColumn -= last;
		}
		message.line -= lines - 1;
		if (message.endLine) {
			message.endLine -= lines - 1;
		}
		if (message.fix) {
			message.fix.range[0] -= length;
			message.fix.range[1] -= length;
		}
	}
	// adjust position reference according to the previous dedenting
	{
		const { offsets, total_offsets } = dedent;
		message.column += offsets[message.line - 1];
		if (message.endColumn) {
			message.endColumn += offsets[message.endLine - 1];
		}
		if (message.fix) {
			message.fix.range[0] += total_offsets[message.line];
			message.fix.range[1] += total_offsets[message.line];
		}
	}
	// shift position reference forward according to offsets
	{
		const { length, lines, last } = offsets;
		if (message.line === 1) {
			message.column += last;
		}
		if (message.endColumn && message.endLine === 1) {
			message.endColumn += last;
		}
		message.line += lines - 1;
		if (message.endLine) {
			message.endLine += lines - 1;
		}
		if (message.fix) {
			message.fix.range[0] += length;
			message.fix.range[1] += length;
		}
	}
	// make sure the fix doesn't include anything outside the range of the script
	if (message.fix) {
		if (message.fix.range[0] < range[0]) {
			message.fix.text = message.fix.text.slice(range[0] - message.fix.range[0]);
			message.fix.range[0] = range[0];
		}
		if (message.fix.range[1] > range[1]) {
			message.fix.text = message.fix.text.slice(0, range[1] - message.fix.range[1]);
			message.fix.range[1] = range[1];
		}
	}
};

// extract the string referenced by a message
const get_referenced_string = (block, message) => {
	if (message.line && message.column && message.endLine && message.endColumn) {
		if (!block.line_offsets) {
			block.line_offsets = get_line_offsets$1(block.transformed_code);
		}
		return block.transformed_code.slice(block.line_offsets[message.line - 1] + message.column, block.line_offsets[message.endLine - 1] + message.endColumn);
	}
};

// extract something that looks like an identifier (not supporting unicode escape stuff) from the beginning of a string
const get_identifier = str => (str && str.match(/^[^\s!"#%&\\'()*+,\-./:;<=>?@[\\\]^`{|}~]+/) || [])[0];

// determine whether this message from ESLint is something we care about
const is_valid_message = (block, message, translation) => {
	switch (message.ruleId) {
		case 'eol-last': return false;
		case '@typescript-eslint/indent':
		case 'indent': return !translation.options.template;
		case 'linebreak-style': return message.line !== translation.end;
		case 'no-labels': return get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-restricted-syntax': return message.nodeType !== 'LabeledStatement' || get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-self-assign': return !state.var_names.has(get_identifier(get_referenced_string(block, message)));
		case 'no-unused-labels': return get_referenced_string(block, message) !== '$';
		case '@typescript-eslint/quotes':
		case 'quotes': return !translation.options.in_quoted_attribute;
	}
	return true;
};

// transform linting messages and combine with compiler warnings
const postprocess = blocks_messages => {
	// filter messages and fix their offsets
	const blocks_array = [...state.blocks.values()];
	for (let i = 0; i < blocks_messages.length; i++) {
		const block = blocks_array[i];
		for (let j = 0; j < blocks_messages[i].length; j++) {
			const message = blocks_messages[i][j];
			const translation = block.translations.get(message.line);
			if (translation && is_valid_message(block, message, translation)) {
				transform_message(block, translation, message);
				state.messages.push(message);
			}
		}
	}

	// sort messages and return
	const sorted_messages = state.messages.sort((a, b) => a.line - b.line || a.column - b.column);
	reset();
	return sorted_messages;
};

var index = {
  processors: { svelte3: { preprocess, postprocess, supportsAutofix: true } },
  configs: {
    defaultWithJsx: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      overrides: [
        {
          files: ["**/*.{tsx,jsx}"],
        },
      ],
    },
  },
};

module.exports = index;
//# sourceMappingURL=index.js.map
