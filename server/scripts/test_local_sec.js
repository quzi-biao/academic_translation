import { checkLocalText } from '../src/services/localSecurity.js';

console.log("Testing safe text:");
console.log(checkLocalText("今天天气真好"));

console.log("Testing sensitive text:");
console.log(checkLocalText("特级毛片高清无码"));

console.log("Testing evasion text:");
console.log(checkLocalText("代*考"));

