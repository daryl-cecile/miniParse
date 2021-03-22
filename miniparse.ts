type CursorPosition = {
	col:number
	row:number
}

class BasicToken {
	public content:string;
	public type:string;
	public position:CursorPosition;

	constructor(type?:string, content?:string, position?:CursorPosition){
		this.content = content;
		this.type = type;
		this.position = position;
	}

	static Create(type?:string, content?:string, position?:CursorPosition){
		return new BasicToken(type, content, position);
	}

}

class ComplexToken extends BasicToken{
	public attributes = [];

	static Parse(input:string){

	}
}

class TokenizerRegister{
	private flags = {};
	private currentWord:string = "";
	private _collection:Array<BasicToken> = [];

	public get collection(){
		return [
			...this._collection,
			BasicToken.Create("EOF", "", {col:0, row:0}) // end of file
		]
	}

	constructor(){
		this._collection = [
			BasicToken.Create("SOF", "", {col:0, row:0}) // start of file
		]
	}

	nibble(character:string, index:number, input:string){
		let previousToken = this._collection[this._collection.length - 1];

		if ("\"'`".indexOf(character) > -1){
			this.currentWord += character;
			if (this.flags['isString']){
				if (this.flags['quote'] === character){
					this.flags['isString'] = false;
					this.flags['quote'] = null;
				}
				return;
			}
			if (previousToken.type === "EQUAL"){
				this.flags['isString'] = true;
				this.flags['quote'] = character;
			}
			return;
		}

		if (this.flags['isString']){
			this.currentWord += character;
			return;
		}

		if ("</>".indexOf(character) > -1){

			if (this.flags['isString']){
				this.currentWord += character;
				return;
			}

			if (character === "/"){
				if (this.currentWord.length > 0){
					this._collection.push(
						BasicToken.Create("WORD", this.currentWord, getPosition(index - this.currentWord.length, input))
					);
					this.currentWord = "";
				}
				this._collection.push(
					BasicToken.Create("BRACKET.SLASH", "/", getPosition(index, input))
				);
				return;
			}

			if (character === "<"){
				if (this.currentWord.length > 0){
					this._collection.push(
						BasicToken.Create("WORD", this.currentWord, getPosition(index - this.currentWord.length, input))
					);
					this.currentWord = "";
				}
				this._collection.push(
					BasicToken.Create("BRACKET.OPEN", "<", getPosition(index, input))
				);
				return;
			}

			if (character === ">"){
				if (this.currentWord.length > 0 && (previousToken.type === "BRACKET.OPEN" || previousToken.type === "BRACKET.SLASH")){
					this._collection.push(
						BasicToken.Create("WORD", this.currentWord, getPosition(index - this.currentWord.length, input))
					);
					this.currentWord = "";
				}
				if (this.currentWord.length > 0 && previousToken.type === "EQUAL"){
					this._collection.push(
						BasicToken.Create("ATTR.VALUE", this.currentWord, getPosition(index - this.currentWord.length, input))
					);
					this.currentWord = "";
				}
				this._collection.push(
					BasicToken.Create("BRACKET.CLOSE", ">", getPosition(index, input))
				);
				return;
			}

		}

		if (character === "="){
			if (this.currentWord.length > 0 && previousToken.type === "SPACE"){
				this._collection.push(
					BasicToken.Create("ATTR.NAME", this.currentWord, getPosition(index - this.currentWord.length, input))
				);
				this.currentWord = "";
			}

			this._collection.push(
				BasicToken.Create("EQUAL", "=", getPosition(index, input))
			);
			return;
		}

		if (character === " "){
			if (this.flags['isString']) {
				this.currentWord += character;
				return;
			}
			else if (this.currentWord.length > 0){
				this._collection.push(
					BasicToken.Create("WORD", this.currentWord, getPosition(index - this.currentWord.length, input))
				);
				this.currentWord = "";
			}

			this._collection.push(
				BasicToken.Create("SPACE", " ", getPosition(index, input))
			);
			this.currentWord = "";
			return;
		}

		this.currentWord += character;
	}

	clear(){
		this._collection = [];
	}
}

class TokenCompressor{
	private collection:Array<BasicToken> = [];

	constructor(private maxTokenCount:number = 4) {}

	push(token:BasicToken){
		this.collection.push(token);
		while (this.collection.length > this.maxTokenCount){
			this.collection.shift();
		}
	}

	get(index:number){
		if (index >= 0) return this.collection[index];
		return this.collection[this.collection.length + index];
	}

	serializeContent(){
		return this.collection.map(t => t.content).join("");
	}

	get length(){
		return this.collection.length;
	}
}

class TokenWalker{
	private cursor = 0;

	constructor(private tokens:Array<BasicToken>) {}

	resetCursor(){
		this.cursor = 0;
		return this;
	}

	walkUntil(predicate:(token:BasicToken)=>boolean):Array<BasicToken>{
		let footPrint = [];
		for (let c = this.cursor; c < this.tokens.length; c++){
			let t = this.tokens[this.cursor];
			let v = predicate(t);
			footPrint.push(t);
			this.cursor++;
			if (v) break;
		}
		return footPrint;
	}

	nextToken(){
		return this.tokens[this.cursor];
	}

	step(steps:number=1){
		this.cursor+=steps;
		return this;
	}

	isEOF(){
		return this.cursor + 1 >= this.tokens.length
	}
}

function getPosition(cursorIndex:number, input:string):CursorPosition{
	let lines = input.split("\n");
	let p = cursorIndex;

	let position:CursorPosition = {col: 0, row: 0};

	while (lines.length > 0){
		let line = lines.shift();
		if (p > line.length){
			p -= (line.length + 1); // +1 for line break
			position.row ++;
		}
		else if (line.length > p && p > 0){
			position.col = p;
			break;
		}
	}

	return position;
}

function tokenize(input:string):Array<BasicToken>{
	let characters = input.split("");
	let register = new TokenizerRegister();

	characters.forEach((c,i) => {
		register.nibble(c, i, input);
	});

	return register.collection;
}

function compressTokens(tokens:Array<BasicToken>){
	let collection = [];
	let compressor = new TokenCompressor(3);

	tokens.forEach((token, tokenIndex) => {

		compressor.push(token);

		let prevToken = collection[collection.length - 1];
		let prevInputToken = tokens[tokenIndex - 1];

		if (compressor.get(0).content === "<" && compressor.get(-1).content === ">"){
			collection.push(
				BasicToken.Create("TAG.OPEN", compressor.serializeContent(), compressor.get(0).position)
			);
		}
		else if (compressor.get(0).content === "<" && compressor.get(-1).content === "/"){
			collection.push(
				BasicToken.Create("TAG.SELF_CLOSE", compressor.serializeContent(), compressor.get(0).position)
			);
		}
		else if (compressor.get(0).content === "/" && compressor.get(-1).content === ">"){
			collection.push(
				BasicToken.Create("TAG.CLOSE", "<" + compressor.serializeContent(), prevInputToken.position)
			);
		}
		else{
			// if (token.content === ">") return;
			// if (token.content === "<") return;
			if (prevToken && prevToken.type !== "TAG.OPEN" && prevToken.type !== "TAG.CLOSE") return;
			collection.push( token );
		}

	});

	return collection.filter(item => item.type !== "BRACKET.OPEN");
}

function walkTokens(tokens:Array<BasicToken>){
	let walker = new TokenWalker(tokens);

	while (!walker.isEOF()){
		if (walker.nextToken().type === "SOF" || walker.nextToken().type === "EOF") {
			walker.step();
			continue;
		}
		if (walker.nextToken().type === "BRACKET.OPEN"){
			let c = walker.walkUntil(t => t.content === ">");
			console.log( c.map(n => n.content).join("") );
		}
		else{
			let c = walker.walkUntil(t => t.content === "<");
			walker.step(-1);
			console.log( c.splice(0, c.length-1).map(n => n.content).join("") );
		}
	}

	//TODO walk through and generate complex tokens from these basic tokens

}

const testContent = [
	`<div id="on"><p>Hello <strong>World</strong></p>, How are you?</div>`,
	`<div data-attr="{hello:1}"></div>`,
	`<p style="color:red">hello world</p>`,
	`<bold data-ref="<hi>">open</bold>`,
	'<br/>',
	'<hr style="background: red"/>',
	`<div id='olive'>"TST' ING/></div>`
];

testContent.forEach(c => {
	const tokens = tokenize(c);
	// console.log( c, "\n", tokens.map(t => t.content).join("") );

	// console.log( tokens.map(t => JSON.stringify(t)).join("\n") );

	walkTokens(tokens);

	// console.log(
	// 	compressTokens(tokens).map(t => JSON.stringify(t)).join("\n")
	// );
});
