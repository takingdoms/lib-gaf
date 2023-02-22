# Example:
```js
const fs = require('fs');
const { ParseGaf } = require('@takingdoms/lib-gaf');

const data = fs.readFileSync('path/to/gaf-file.gaf');
const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
const result = ParseGaf.fromBuffer(view);

console.log(result);
```
