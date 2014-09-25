#!/usr/bin/env node
/**
 * wordpos.js
 *
 * command-line interface to wordpos
 *
 * Usage:
 *    wordpos [options] <get|parse|def|rand> <stdin|words*>
 *
 * Copyright (c) 2012 mooster@42at.com
 * https://github.com/moos/wordpos
 *
 * Released under MIT license
 */

var program = require('commander'),
  _ = require('underscore')._,
  fs = require('fs'),
  POS = {noun:'Noun', adj:'Adjective', verb:'Verb', adv:'Adverb'},
  version = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version,
  nWords;

program
  .version(version)
  .usage('[options] <command> [word ... | -i <file> | <stdin>]')

  .option('-n, --noun', 'Get nouns')
  .option('-a, --adj', 'Get adjectives')
  .option('-v, --verb', 'Get verbs')
  .option('-r, --adv', 'Get adverbs')

  .option('-c, --count', 'count only (noun, adj, verb, adv, total parsed words)')
  .option('-b, --brief', 'brief output (all on one line, no headers)')
  .option('-f, --full', 'full results object')
  .option('-j, --json', 'full results object as JSON')
  .option('-i, --file <file>', 'input file')
  .option('-s, --withStopwords', 'include stopwords (default: stopwords are excluded)')
  .option('-N, --num <num>', 'number of random words to return')
  ;

program.command('get')
  .description('get list of words for particular POS')
  .action(exec);

program.command('def')
  .description('lookup definitions')
  .action(function(){
    _.last(arguments)._name = 'lookup';
    exec.apply(this, arguments);
  });

program.command('rand')
  .description('get random words (starting with <word>, optionally)')
  .action(exec);

program.command('parse')
  .description('show parsed words, deduped and less stopwords')
  .action(exec);

program.command('stopwords')
  .description('show list of stopwords (valid options are -b and -j)')
  .action(function(){
    cmd = _.last(arguments)._name;
    var stopwords = WordPos.natural.stopwords;

    if (program.json)
      output(stopwords);
    else
      console.log(stopwords.join(program.brief ? ' ' : '\n'))
  });

var
  WordPos = require('../src/wordpos'),
  util = require('util'),
  results = {},
  cmd = null;


program.parse(process.argv);
if (!cmd) console.log(program.helpInformation());


function exec(/* args, ..., program.command */){
  var args = _.initial(arguments);
  cmd = _.last(arguments)._name;

  if (program.file) {
    fs.readFile(program.file, 'utf8', function(err, data){
      if (err) return console.log(err);
      run(data);
    });
  } else if (args.length || cmd == 'rand'){
    run(args.join(' '));
  } else {
    read_stdin(run);
  }
}

function read_stdin(callback) {
  var data = '';
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) {
    var c = chunk.charCodeAt(0);
    if (c == 4 || c == 26) // ^c or ^d followed by \n
      return process.stdin.emit('end') && process.stdin.pause();
    data += chunk;
  });
  process.stdin.on('end', function () {
    callback(data);
  });
}

function optToFn() {
  var fns = _.reject(POS, function(fn, opt) { return !program[opt] });
  if (!fns.length && cmd === 'rand') return fns = ['']; // run rand()
  if (!fns.length) fns = _.values(POS); //default to all if no POS given
  return fns;
}


function run(data) {
  var
    opts = {stopwords: !program.withStopwords},
    wordpos = new WordPos(opts),
    words = wordpos.parse(data),
    fns = optToFn(),
    plural = (cmd=='get' ? 's':''),
    results = {},
    finale = _.after(
        plural ? fns.length : words.length * fns.length,
        _.bind(output, null, results)),
    collect = function(what, result, word){
      if (word) {	// lookup
        results[word] = [].concat(results[word] || [], result);
      } else {		// get
        results[what] = result;
      }
      finale();
    };

  nWords = words.length;
  if (cmd == 'parse') return output({words: words});

  // loop over desired POS
  _(fns).each(function(fn){
    var method = cmd + fn + plural,
      cb = _.bind(collect, null, fn);

    if (cmd == 'get') {
      wordpos[method](words, cb);
    } else if (cmd == 'rand') {
      words.forEach(function(word){
        wordpos[method]({startsWith: word, count: program.num || 1}, cb);
      });
    } else {
      words.forEach(function(word){
        wordpos  [method](word, cb);
      });
    }
  });
}

function output(results) {
  var str;
  if (program.count && cmd != 'lookup') {
    str = (cmd == 'get' && _.reduce(POS, function(memo, v){
      return memo + ((results[v] && results[v].length) || 0) +" ";
    },'')) + nWords;
  } else {
    str = sprint(results);
  }
  console.log(str);
}

function sprint(results) {
  if (program.json) {
    return util.format('%j',results);
  } else if (program.full) {
    return util.inspect(results,false,10, true);
  }
  var sep = program.brief ? ' ' : '\n';

  switch (cmd) {
  case 'lookup':
    return _.reduce(results, function(memo, v, k){
      return memo + (v.length && (k +"\n"+ print_def(v) +"\n") || '');
    }, '');
  default:
    return _.reduce(results, function(memo, v, k){
      var pre = program.brief ? '' : util.format('# %s %d:%s', k,  v.length, sep);
      return memo + (v.length && util.format('%s%s%s\n', pre, v.join(sep), sep) || '');
    }, '');
  }

  function print_def(defs) {
    return _.reduce(defs, function(memo, v, k){
      return memo + util.format('  %s: %s\n', v.pos, v.gloss);
    },'');
  }
}

