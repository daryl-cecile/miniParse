type CursorPosition = {
	col:number
	row:number
}

class Token{
	public content:string;
	public type:string;
	public position:CursorPosition;

	constructor(type?:string, content?:string, position?:CursorPosition){
		if (!!type && !!content && !!position){
			this.content = content;
			this.type = type;
			this.position = position;
		}
	}

	static Create(type?:string, content?:string, position?:CursorPosition){
		return new Token(type, content, position);
	}

}

class TokenizerRegister{
	private flags = {};
	private currentWord:string = "";
	public collection:Array<Token> = [];

	constructor(){
		this.collection = [
			Token.Create("SOF", "", {col:0, row:0}) // start of file
		]
	}

	nibble(character:string, index:number, input:string){
		let previousToken = this.collection[this.collection.length - 1];
		if ("</>".indexOf(character) > -1){

			if (this.flags['isString']){
				this.currentWord += character;
				return;
			}

			if (character === "/"){
				this.collection.push(
					Token.Create("BRACKET.SLASH", "/", getPosition(index, input))
				);
				return;
			}

			if (character === "<"){
				if (this.currentWord.length > 0){
					this.collection.push(
						Token.Create("WORD", this.currentWord, getPosition(index - this.currentWord.length, input))
					);
					this.currentWord = "";
				}
				this.collection.push(
					Token.Create("BRACKET.OPEN", "<", getPosition(index, input))
				);
				return;
			}

			if (character === ">"){
				if (this.currentWord.length > 0 && (previousToken.type === "BRACKET.OPEN" || previousToken.type === "BRACKET.SLASH")){
					this.collection.push(
						Token.Create("WORD", this.currentWord, getPosition(index - this.currentWord.length, input))
					);
					this.currentWord = "";
				}
				if (this.currentWord.length > 0 && previousToken.type === "EQUAL"){
					this.collection.push(
						Token.Create("ATTR.VALUE", this.currentWord, getPosition(index - this.currentWord.length, input))
					);
					this.currentWord = "";
				}
				this.collection.push(
					Token.Create("BRACKET.CLOSE", ">", getPosition(index, input))
				);
				return;
			}

		}

		if (character === "="){
			if (this.currentWord.length > 0 && previousToken.type === "SPACE"){
				this.collection.push(
					Token.Create("ATTR.NAME", this.currentWord, getPosition(index - this.currentWord.length, input))
				);
				this.currentWord = "";
			}

			this.collection.push(
				Token.Create("EQUAL", "=", getPosition(index, input))
			);
			return;
		}

		if (character === " "){
			if (this.flags['isString']) {
				this.currentWord += character;
				return;
			}
			else if (this.currentWord.length > 0){
				this.collection.push(
					Token.Create("WORD", this.currentWord, getPosition(index - this.currentWord.length, input))
				);
				this.currentWord = "";
			}

			this.collection.push(
				Token.Create("SPACE", " ", getPosition(index, input))
			);
			this.currentWord = "";
			return;
		}

		if ("\"'`".indexOf(character) > -1){
			this.currentWord += character;
			if (this.flags['isString']){
				if (this.flags['quote'] === character){
					this.flags['isString'] = false;
					this.flags['quote'] = null;
				}
				return;
			}
			this.flags['isString'] = true;
			this.flags['quote'] = character;
			return;
		}

		this.currentWord += character;
	}
}

class TokenCompressor{
	private collection:Array<Token> = [];

	constructor(private maxTokenCount:number = 4) {}

	push(token:Token){
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

function tokenize(input:string):Array<Token>{
	let characters = input.split("");
	let register = new TokenizerRegister();

	characters.forEach((c,i) => {
		register.nibble(c, i, input);
	});

	return register.collection;
}

function compressTokens(tokens:Array<Token>){
	let collection = [];
	let compressor = new TokenCompressor(3);

	tokens.forEach((token, tokenIndex) => {

		compressor.push(token);

		let prevToken = collection[collection.length - 1];
		let prevInputToken = tokens[tokenIndex - 1];

		if (compressor.get(0).content === "<" && compressor.get(-1).content === ">"){
			collection.push(
				Token.Create("TAG.OPEN", compressor.serializeContent(), compressor.get(0).position)
			);
		}
		else if (compressor.get(0).content === "<" && compressor.get(-1).content === "/"){
			collection.push(
				Token.Create("TAG.SELF_CLOSE", compressor.serializeContent(), compressor.get(0).position)
			);
		}
		else if (compressor.get(0).content === "/" && compressor.get(-1).content === ">"){
			collection.push(
				Token.Create("TAG.CLOSE", "<" + compressor.serializeContent(), prevInputToken.position)
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

const testContent = `<div id="on"><p>Hello <strong>World</strong></p>, How are you?</div>`;
const tokens = tokenize(testContent);

console.log(
	tokens.map(t => JSON.stringify(t)).join("\n")
);

// console.log(
// 	compressTokens(tokens).map(t => JSON.stringify(t)).join("\n")
// );