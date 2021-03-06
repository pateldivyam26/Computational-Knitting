"use strict";

const fs = require('fs');

let StartRows = 10;
let EndRows = 10;

let YarnInStitchNumber = 67;
let CastOnStitchNumber = 67;
let PlainStitchNumber  = 68;

let OutFile = "";

//figure out output filename based on input js name / other arguments:
if (process.argv.length >= 2) {
	if (process.argv[1].endsWith(".js")) {
		OutFile = process.argv[1].substr(0, process.argv[1].length - 3) + ".k";
	}
	for (let i = 2; i < process.argv.length; ++i) {
		if (process.argv[i].startsWith("out:")) {
			OutFile = process.argv[i].substr(4);
		}
	}
}

if (OutFile === "") {
	console.log("NOTE: will not write output file.");
} else {
	console.log("Will write output to '" + OutFile + "'");
}

function parseBedNeedle(bn) {
	if (typeof(bn) !== "string") throw new Error("parseBedNeedle must be called with a string");
	let m = bn.match(/^([fb]s?)([-+]?\d+)$/);
	if (m === null) throw new Error("string '" + bn + "' does not look like a needle");
	return {
		bed:m[1],
		needle:parseInt(m[2])
	};
}

function bnToHalf(bn_str) {
	let bn = parseBedNeedle(bn_str);
	if      (bn.bed === 'f')  return 'f' + (2*bn.needle);
	else if (bn.bed === 'fs') return 'f' + (2*bn.needle+1);
	else if (bn.bed === 'b')  return 'b' + (2*bn.needle+1);
	else if (bn.bed === 'bs') return 'b' + (2*bn.needle);
	else throw "don't know how to half-guage the needle '" + bn_str + "'";
}

function Helpers() {
	this.knitout = [];
	this.racking = 0;
	this.needIn = true; //TODO: bring in carrier in a nice way when resuming another tube
	this.out(";!knitout-2");
	this.out(";;Carriers: 1 2 3 4 5 6 7 8 9 10");
}

Helpers.prototype.out = function out(str) {
	//console.log("OUT: " + str);
	this.knitout.push(str);
};

Helpers.prototype.write = function write() {
	if (OutFile !== "") {
		fs.writeFileSync(OutFile, this.knitout.join("\n") + "\n");
	}
};

Helpers.prototype.raw_inst = function raw_inst(str){
	this.out(str);
}

Helpers.prototype.start_tube = function end_tube(dir, bns, Carrier) {
	let front = [];
	let back = [];
	bns.forEach(function(bn_str){
		let bn = parseBedNeedle(bn_str)
		if (bn.bed === 'f') {
			front.push(bn.needle);
		} else if (bn.bed === 'b') {
			back.push(bn.needle);
		} else {
			console.assert("start_tube should only be called with 'f' or 'b' needles.");
		}
	});
	front.sort();
	back.sort();

	console.assert(front.length !== 0 && back.length !== 0, "should start a tube with at least a stitch on each bed.");

	//do a tuck pattern to anchor yarn:
	// v   v   v <--
	//   v   v   -->
	//         ^------ first needle to be knit is here
	let n = Math.max(front[front.length-1], back[back.length-1]);
	let toDrop = [];
	let me = this;
	function initTuck(d, bn, c) {
		me.tuck(d, bn, c);
		toDrop.push(bn);
	}
	this.out("x-stitch-number " + YarnInStitchNumber);
	this.out("inhook " + Carrier);
	initTuck('-', 'f' + n, Carrier);
	initTuck('-', 'f' + (n-2), Carrier);
	initTuck('-', 'f' + (n-4), Carrier);
	initTuck('+', 'f' + (n-3), Carrier);
	initTuck('+', 'f' + (n-1), Carrier);
	this.out("releasehook " + Carrier);

	//make list of needles and directions in tube order:
	let sts = [];
	if (dir === 'clockwise') {
		for (let i = front.length-1; i >= 0; --i) {
			sts.push(['-', 'f' + front[i]]);
		}
		for (let i = 0; i < back.length; ++i) {
			sts.push(['+', 'b' + back[i]]);
		}
	} else { console.assert(dir === 'anticlockwise');
		for (let i = back.length-1; i >= 0; --i) {
			sts.push(['-', 'b' + back[i]]);
		}
		for (let i = 0; i < front.length; ++i) {
			sts.push(['+', 'f' + front[i]]);
		}
	}

	//alternating tuck cast on:
	this.out("x-stitch-number " + CastOnStitchNumber);
	sts.forEach(function(dbn, i) {
		if (i%2 == 0) this.knit(dbn[0], dbn[1], Carrier);
	}, this);
	sts.forEach(function(dbn, i) {
		if (i%2 == 1) this.knit(dbn[0], dbn[1], Carrier);
	}, this);

	//drop everything in 'toDrop' that wasn't part of alternating tucks:
	toDrop.forEach(function(bn){
		//WARNING: this might actually drop **TOO MUCH** if the tucked needles overlap other existing stitches
		let idx = bns.indexOf(bn);
		if (idx === -1) {
			this.drop(bn);
		}
	}, this);

	//knit some plain rows:
	this.out("x-stitch-number " + PlainStitchNumber);
	for (let row = 0; row < StartRows; ++row) {
		sts.forEach(function(dbn, i) {
			this.knit(dbn[0], dbn[1], Carrier);
		}, this);
	}

	let first = 0;
	while (first < sts.length && sts[first][1] !== bns[0]) ++first;
	console.assert(first < sts.length, "First stitch from 'bns' should exist in 'sts'.");

	//knit a bit extra to get aligned to the input bns:
	for (let i = 0; i < first; ++i) {
		let st = sts.shift();
		this.knit(st[0], st[1], Carrier);
		sts.push(st);
	}

	//alternating stitches to separate starting tube from knitting:
	this.out("x-stitch-number " + CastOnStitchNumber);
	sts.forEach(function(dbn, i) {
		if (i%2 == 0) this.knit(dbn[0], dbn[1], Carrier);
	}, this);
	sts.forEach(function(dbn, i) {
		if (i%2 == 1) this.knit(dbn[0], dbn[1], Carrier);
	}, this);

	this.out("x-stitch-number " + PlainStitchNumber);

};

Helpers.prototype.knit = function knit(d, bn, Carrier) {
	this.out("knit " + d + " " + bnToHalf(bn) + " " + Carrier);
};

Helpers.prototype.drop = function drop(bn) {
	this.out("drop " + bnToHalf(bn));
};

Helpers.prototype.tuck = function tuck(d, bn, Carrier) {
	this.out("tuck " + d + " " + bnToHalf(bn) + " " + Carrier);
};

Helpers.prototype.miss = function miss(d, bn, Carrier) {
	this.out("miss " + d + " " + bnToHalf(bn) + " " + Carrier);
};

Helpers.prototype.decrease = function decrease(d, bn, Carrier) {
	this.knit(d, bn, Carrier);
};

Helpers.prototype.increase = function increase(d0, bn0, d1, bn1, Carrier) {
	this.knit(d0, bn0, Carrier);
	this.tuck(d1 == '+' ? '-' : '+', bn1, Carrier);
};

Helpers.prototype.end_tube = function end_tube(dir, bns, cs) {
	//d(bn) returns direction to knit on 'bn' given overall tube direction
	function d(bn_str) {
		let bn = parseBedNeedle(bn_str);
		if (bn.bed[0] === 'f') {
			if (dir === 'clockwise') {
				return '-';
			} else { console.assert(dir === 'anticlockwise', "dir is always clockwise or anticlockwise");
				return '+';
			}
		} else { console.assert(bn.bed[0] === 'b', "bed is always f* or b*");
			if (dir === 'clockwise') {
				return '+';
			} else { console.assert(dir === 'anticlockwise', "dir is always clockwise or anticlockwise");
				return '-';
			}
		}
	}

	//alternating stitches to separate ending tube from knitting:
	this.out("x-stitch-number " + CastOnStitchNumber);
	bns.forEach(function(bn, i) {
		if (i%2 == 0) this.knit(d(bn), bn, cs);
	}, this);
	bns.forEach(function(bn, i) {
		if (i%2 == 1) this.knit(d(bn), bn, cs);
	}, this);

	this.out("x-stitch-number " + PlainStitchNumber);
	for (let row = 0; row < EndRows; ++row) {
		bns.forEach(function(bn, i) {
			this.knit(d(bn), bn, cs);
		}, this);
	}

	this.out("outhook " + cs);

	bns.forEach(function(bn, i) {
		this.drop(bn);
	}, this);


};

Helpers.prototype.xfer = function xfer(from, to) {
	this.out("xfer " + bnToHalf(from) + " " + bnToHalf(to));
};

Helpers.prototype.setRacking = function setRacking(from_str, to_str) {
	let target;
	if (arguments.length === 0) {
		target = 0;
	} else {
		let from = parseBedNeedle(bnToHalf(from_str));
		let to = parseBedNeedle(bnToHalf(to_str));
		if (from.bed === 'f' && to.bed === 'b') {
			target = from.needle - to.needle;
		} else { console.assert(from.bed === 'b' && to.bed === 'f');
			target = to.needle - from.needle;
		}
		console.assert(Math.abs(target) <= 8, "Racking out of limits?"+from_str+" "+to_str);
	}
	if (this.racking !== target) {
		this.racking = target;
		this.out("rack " + this.racking);
	}
};

Helpers.prototype.xfer_cycle = function xfer_cycle(opts, from, to, xfers) {
	xfers.forEach(function(xf){
		this.setRacking(xf[0], xf[1]);
		this.xfer(xf[0], xf[1]);
	}, this);
};

Helpers.prototype.stash = function stash(from, to) {
	if (from.length !== to.length) throw new Error("from and to arrays should be the same length");
	if (from.length === 0) return;

	this.setRacking(from[0], to[0]);

	for (let i = 0; i < from.length; ++i) {
		this.xfer(from[i], to[i]);
	}

	this.setRacking();
};

Helpers.prototype.unstash = function unstash(from, to) {
	if (from.length !== to.length) throw new Error("from and to arrays should be the same length");
	if (from.length === 0) return;

	this.setRacking(from[0], to[0]);

	for (let i = 0; i < from.length; ++i) {
		this.xfer(from[i], to[i]);
	}

	this.setRacking();
};


module.exports = {Helpers:Helpers};
