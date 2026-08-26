import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PATCH_MARKER = 'deepseek-harness-electron:model-capabilities-v1'
const CLIENT_ENTRY = join(
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-settings-models',
  'lib',
  'client.js',
)

const CAPABILITY_HELPERS = `
		/* ${PATCH_MARKER} */
		const MODEL_INPUT_OPTIONS = [
			["default", "modelInputDefault"],
			["text", "modelInputText"],
			["vision", "modelInputVision"]
		];
		const MODEL_REASONING_OPTIONS = [
			["default", "modelReasoningDefault"],
			["disabled", "modelReasoningDisabled"],
			["standard", "modelReasoningStandard"],
			["extended", "modelReasoningExtended"]
		];
		const STANDARD_REASONING_EFFORTS = {
			off: null,
			minimal: "minimal",
			low: "low",
			medium: "medium",
			high: "high"
		};
		const EXTENDED_REASONING_EFFORTS = {
			...STANDARD_REASONING_EFFORTS,
			xhigh: "xhigh",
			max: "max"
		};
		function inputCapability(model) {
			const input = model["input"];
			if (!Array.isArray(input) || input.length === 0) return "default";
			return input.includes("image") ? "vision" : "text";
		}
		function inputForCapability(capability) {
			if (capability === "default") return void 0;
			return capability === "vision" ? ["text", "image"] : ["text"];
		}
		function reasoningCapability(model) {
			const efforts = model["reasoningEfforts"];
			if (efforts === void 0) return "default";
			if (efforts === false) return "disabled";
			return typeof efforts === "object" && efforts !== null && ("xhigh" in efforts || "max" in efforts) ? "extended" : "standard";
		}
		function reasoningForCapability(capability) {
			if (capability === "default") return void 0;
			if (capability === "disabled") return false;
			return capability === "extended" ? { ...EXTENDED_REASONING_EFFORTS } : { ...STANDARD_REASONING_EFFORTS };
		}
		function CapabilitySelect(props) {
			return (0, react_jsx_runtime.jsxs)("label", {
				className: ModelsSection_module_css_default["modelField"],
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: ModelsSection_module_css_default["modelFieldLabel"],
					children: props.t(props.label)
				}), (0, react_jsx_runtime.jsx)("select", {
					className: ModelsSection_module_css_default["input"],
					value: props.value,
					disabled: props.disabled,
					onChange: (event) => props.onChange(event.target.value),
					children: props.options.map(([value, label]) => (0, react_jsx_runtime.jsx)("option", {
						value,
						children: props.t(label)
					}, value))
				})]
			});
		}
`

const INPUT_FIELD = `, (0, react_jsx_runtime.jsx)(CapabilitySelect, {
									label: "modelInput",
									value: inputCapability(model),
									options: MODEL_INPUT_OPTIONS,
									t,
									disabled,
									onChange: (value) => patch(index, { input: inputForCapability(value) })
								})`

const REASONING_FIELD = `, (0, react_jsx_runtime.jsx)(CapabilitySelect, {
									label: "modelReasoning",
									value: reasoningCapability(model),
									options: MODEL_REASONING_OPTIONS,
									t,
									disabled,
									onChange: (value) => patch(index, { reasoningEfforts: reasoningForCapability(value) })
								})`

const COPY = {
  en: {
    modelAdvanced: 'Capabilities',
    modelInput: 'Input',
    modelInputDefault: 'Model / provider default',
    modelInputText: 'Text only',
    modelInputVision: 'Text + images',
    modelReasoning: 'Reasoning levels',
    modelReasoningDefault: 'Provider default',
    modelReasoningDisabled: 'Not supported',
    modelReasoningStandard: 'Off / Minimal / Low / Medium / High',
    modelReasoningExtended: 'Standard + Extra high / Max',
  },
  zh: {
    modelAdvanced: '模型能力',
    modelInput: '输入能力',
    modelInputDefault: '模型 / 提供方默认',
    modelInputText: '仅文本',
    modelInputVision: '文本 + 图片',
    modelReasoning: '思考等级',
    modelReasoningDefault: '提供方默认',
    modelReasoningDisabled: '不支持',
    modelReasoningStandard: '关闭 / 极简 / 低 / 中 / 高',
    modelReasoningExtended: '标准 + 超高 / 最大',
  },
}

export async function patchHarnessModelCapabilities(runtimeRoot) {
  const clientPath = join(resolve(runtimeRoot), CLIENT_ENTRY)
  const source = await readFile(clientPath, 'utf8')
  if (source.includes(PATCH_MARKER)) return false

  let patched = replaceOnce(
    source,
    '\t\tfunction capacitySpelling(value) {\n\t\t\treturn value === void 0 ? \"\" : formatCapacity(value);\n\t\t}\n',
    (match) => match.concat(CAPABILITY_HELPERS),
    'capacity helper',
  )

  const advancedStart = patched.indexOf('\t\tfunction ModelListEditor(props) {')
  if (advancedStart === -1) throw incompatible('ModelListEditor')
  const advancedEnd = patched.indexOf('\n\t\t//#endregion', advancedStart)
  if (advancedEnd === -1) throw incompatible('ModelListEditor end')
  const before = patched.slice(0, advancedStart)
  let editor = patched.slice(advancedStart, advancedEnd)
  const after = patched.slice(advancedEnd)

  const maxTokensControl = editor.indexOf('editCapacity(index, \"maxTokens\", event.target.value);')
  if (maxTokensControl === -1) throw incompatible('maxTokens control')
  const advancedClose = editor.indexOf('\n\t\t\t\t\t\t}) : null]', maxTokensControl)
  if (advancedClose === -1) throw incompatible('advanced model fields end')
  const fieldArrayClose = editor.lastIndexOf(']', advancedClose)
  if (fieldArrayClose < maxTokensControl) throw incompatible('advanced model fields array')
  editor = editor.slice(0, fieldArrayClose)
    .concat(INPUT_FIELD, REASONING_FIELD, editor.slice(fieldArrayClose))
  patched = before.concat(editor, after)

  for (const [locale, values] of Object.entries(COPY)) {
    const localeStart = patched.indexOf(`\t\tconst ${locale} = {`)
    if (localeStart === -1) throw incompatible(`${locale} locale`)
    const localeEnd = patched.indexOf('\n\t\t};', localeStart)
    if (localeEnd === -1) throw incompatible(`${locale} locale end`)
    let dictionary = patched.slice(localeStart, localeEnd)
    dictionary = replaceOnce(
      dictionary,
      /\t\t\tmodelAdvanced: \"[^\"]*\",/,
      `\t\t\tmodelAdvanced: ${JSON.stringify(values.modelAdvanced)},`,
      `${locale} modelAdvanced copy`,
    )
    const additions = Object.entries(values)
      .filter(([key]) => key !== 'modelAdvanced')
      .map(([key, value]) => `\t\t\t${key}: ${JSON.stringify(value)},`)
      .join('\n')
    dictionary = replaceOnce(
      dictionary,
      /\t\t\tmodelAdvanced: [^\n]+/,
      (match) => `${match}\n${additions}`,
      `${locale} capability copy`,
    )
    patched = patched.slice(0, localeStart).concat(dictionary, patched.slice(localeEnd))
  }

  await writeFile(clientPath, patched, 'utf8')
  return true
}

export async function validateHarnessModelCapabilities(runtimeRoot) {
  const clientPath = join(resolve(runtimeRoot), CLIENT_ENTRY)
  await access(clientPath)
  const source = await readFile(clientPath, 'utf8')
  if (!source.includes(PATCH_MARKER)) {
    throw new Error(`Runtime model-capability patch is missing: ${clientPath}`)
  }
  for (const token of ['inputForCapability', 'reasoningForCapability', 'modelInputVision', 'modelReasoningExtended']) {
    if (!source.includes(token)) throw new Error(`Runtime model-capability patch is incomplete (${token}): ${clientPath}`)
  }
}

function replaceOnce(source, search, replacement, label) {
  const matches = typeof search === 'string'
    ? source.split(search).length - 1
    : [...source.matchAll(new RegExp(search.source, search.flags.includes('g') ? search.flags : `${search.flags}g`))].length
  if (matches !== 1) throw incompatible(`${label}; expected one anchor, found ${String(matches)}`)
  return source.replace(search, replacement)
}

function incompatible(anchor) {
  return new Error(`Installed @deepseek-ai/dsh settings UI is incompatible with the model-capability patch (${anchor}).`)
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const runtimeRoot = resolve(process.argv[2] ?? process.env.DEEPSEEK_HARNESS_DIST ?? join(projectRoot, 'DeepSeek-Harness-Dist'))
  const changed = await patchHarnessModelCapabilities(runtimeRoot)
  await validateHarnessModelCapabilities(runtimeRoot)
  console.log(`${changed ? 'Applied' : 'Validated'} custom model vision/reasoning controls: ${runtimeRoot}`)
}
