const fs = require('fs'),
	glob = require('glob'),
	tokenGetter = require('./token-getter.js');

module.exports = (pattern = '**/*.php', default_options = {}) => {
	const config = Object.assign({
			text_domain: null,
			keywords: [
				'__:1,2d',
				'_e:1,2d',
				'_x:1,2c,3d',
				'esc_html__:1,2d',
				'esc_html_e:1,2d',
				'esc_html_x:1,2c,3d',
				'esc_attr__:1,2d',
				'esc_attr_e:1,2d',
				'esc_attr_x:1,2c,3d',
				'_ex:1,2c,3d',
				'_n:1,2,4d',
				'_nx:1,2,4c,5d',
				'_n_noop:1,2,3d',
				'_nx_noop:1,2,3c,4d',
			],
			correct_domain: false,
			encoding: 'utf-8',
		}, default_options),
		path_files = glob.sync(pattern, {absolute: true});

	if (!config.text_domain) {
		throw new Error(config.text_domain);
	}

	config.text_domain = config.text_domain instanceof Array ? config.text_domain : [config.text_domain];

	config.correct_domain = config.correct_domain && config.text_domain.length === 1;

	const errors = [],
		functions = [],
		func_domain = {},
		patt = new RegExp('([0-9]+)d', 'i'),
		all_errors = {};

	config.keywords.forEach(keyword => {
		const parts = keyword.split(':'),
			[ name ] = parts;
		let argument = 0;

		if (parts.length > 1) {
			const [ args ] = parts,
				arg_parts = args.split(',');

			for (let j = 0; j < arg_parts.length; j += 1) {
				if (patt.test(arg_parts[j])) {
					argument = parseInt(patt.exec(arg_parts[j]), 10);
					break;
				}
			}

			argument = argument ? argument : arg_parts.length + 1;
		} else {
			argument = 2;
		}

		func_domain[name] = argument;
		functions.push(name);
	});

	path_files.forEach(path_file => {
		let modified_content = '';

		if (!fs.existsSync(path_file)) {
			return;
		}

		const tokens = tokenGetter(fs.readFileSync(path_file, config.encoding));
		let gettext_func = {
				name: false,
				line: false,
				domain: false,
				argument: 0,
			},
			parens_balance = 0;

		for (let index = 0; index < tokens.length; index += 1) {
			const tokensCurrent = tokens[index],
				[token, text, line] = tokensCurrent;
			let content =
				typeof tokensCurrent[1] !== 'undefined'
					? tokensCurrent[1]
					: tokensCurrent[0];

			if (token === 306 && functions.indexOf(text) > -1) {
				gettext_func = {
					name: text,
					line,
					domain: false,
					argument: 0,
				};

				parens_balance = 0;
			} else if (
				token === 314 &&
				gettext_func.line &&
				func_domain[gettext_func.name] === gettext_func.argument
			) {
				if (gettext_func.argument > 0) {
					gettext_func.domain = text.substr(1, text.length - 2);

					if (
						config.correct_domain &&
						gettext_func.domain !== config.text_domain[0]
					) {
						content = "'" + config.text_domain[0] + "'";
					}
				}
			} else if (
				token === 308 &&
				gettext_func.line &&
				func_domain[gettext_func.name] === gettext_func.argument
			) {
				if (gettext_func.argument > 0) {
					gettext_func.domain = -1;

					if (config.report_variable_domain && config.correct_domain) {
						content = "'" + config.text_domain[0] + "'";
					}
				}
			} else if (token === ',' && parens_balance === 1 && gettext_func.line) {
				gettext_func.argument += 1;
			} else if (token === '(' && gettext_func.line) {
				if (gettext_func.argument === 0) {
					gettext_func.argument = 1;
				}

				parens_balance += 1;
			} else if (token === ')' && gettext_func.line) {
				parens_balance -= 1;

				if (gettext_func.line && parens_balance === 0) {
					let error_type = false;

					if (config.report_variable_domain && gettext_func.domain === -1) {
						error_type = 'variable-domain';
					} else if (config.report_missing && !gettext_func.domain) {
						error_type = 'missing-domain';
					} else if (
						gettext_func.domain &&
						gettext_func.domain !== -1 &&
						config.text_domain.indexOf(gettext_func.domain) === -1
					) {
						error_type = 'incorrect-domain';
					}

					if (error_type) {
						gettext_func.path = path_file;

						errors.push(gettext_func);
					}

					gettext_func = {
						name: false,
						line: false,
						domain: false,
						argument: 0,
					};
				}
			}

			modified_content += content;
		}

		if (errors.length > 0) {
			if (config.correct_domain) {
				fs.writeFileSync(path_file, modified_content);
			}
		}

		all_errors[path_file] = errors;
	});

	return errors;
};
