const path = require('path');
const checktextdomain = require('./../index.js');

const out = checktextdomain(path.join(__dirname, 'test.php'), {
	text_domain: 'text-domain22'
});
	console.log("out: ", out)
