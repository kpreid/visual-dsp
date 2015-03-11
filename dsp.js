/*
Copyright © 2014, 2015 Kevin Reid

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
var VisualDSP_DSP = (function () {
  'use strict';
  
  var sin = Math.sin;
  var cos = Math.cos;
  var PI = Math.PI;
  var TWOPI = Math.PI * 2;
  
  var blocks = {};
  var exports = {};
  
  function outputArray(instance) {
    return instance instanceof Float32Array ? instance : instance.output;
  }
  
  function ToComplex(audioinb) {
    var audioin = outputArray(audioinb);
    var limit = audioin.length;
    var iqout = new Float32Array(limit * 2);
    return {
      inputs: [audioinb],
      output: iqout,
      run: function toComplex() {
        for (var i = 0, j = 0; i < limit; i++, j += 2) {
          iqout[j] = audioin[i];
          iqout[j+1] = 0;
        }
      },
    };
  }
  blocks.ToComplex = ToComplex;

  function AMModulator(audioinb) {
    var audioin = outputArray(audioinb);
    var limit = audioin.length;
    var iqout = new Float32Array(limit * 2);
    return {
      inputs: [audioinb],
      output: iqout,
      run: function amModulator() {
        for (var i = 0, j = 0; i < limit; i++, j += 2) {
          iqout[j] = 1 + audioin[i];
          iqout[j+1] = 0;
        }
      }
    };
  }
  blocks.AMModulator = AMModulator;

  function FMModulator(audioinb, deviation) {
    var audioin = outputArray(audioinb);
    var limit = audioin.length;
    var iqout = new Float32Array(limit * 2);
    return {
      inputs: [audioinb],
      output: iqout,
      run: function fmModulator() {
        var phase = 0;
        for (var i = limit/2, j = limit; i < limit; i++, j += 2) {
          phase += audioin[i] * deviation;
          iqout[j]   = cos(phase);
          iqout[j+1] = sin(phase);
        }
        phase = 0;
        for (var i = limit/2 - 1, j = limit - 2; i >= 0; i--, j -= 2) {
          phase -= audioin[i] * deviation;
          iqout[j]   = cos(phase);
          iqout[j+1] = sin(phase);
        }
      }
    };
  }
  blocks.FMModulator = FMModulator;
  
  // TODO broken
  // step = 1 for real, 2 for complex.
  // delay: number of samples to delay input by
  // taps: always real
  function FIRFilter(inb, step, delay, taps) {
    var inarr = outputArray(inb);
    var ntaps = taps.length;
    var valdelay = delay * step;  // delay in array-index units
    
    // Range of nonzero output indices if delay = 0
    var undelayedStart = 0;
    var undelayedEnd = inarr.length - (ntaps - 1) * step;
    
    var outLength = inarr.length;  // a choice
    var out = new Float32Array(outLength);
    
    var delayedStart = Math.max(0, Math.min(outLength, undelayedStart - valdelay));
    var delayedEnd   = Math.max(0, Math.min(outLength, undelayedEnd   - valdelay));
    
    //console.log('FIR: 0 .. %d -- %d .. %d | %d in, %d taps', delayedStart, delayedEnd, outLength, inarr.length, ntaps);
    
    return {
      inputs: [inb],
      output: out,
      run: function filterer() {
        var i = 0;
        for (; i < delayedStart; i++) {
          out[i] = NaN;
        }
        for (; i < delayedEnd; i++) {
          var accum = 0;
          for (var j = 0; j < ntaps * step; j += step) {
            accum += inarr[i + valdelay + j] * taps[Math.floor(j / step)];
          }
          out[i] = accum;
        }
        for (; i < outLength; i++) {
          out[i] = NaN;
        }
      }
    };
  }
  blocks.FIRFilter = FIRFilter;
  
  // real or complex
  function Add(in1b, in2b) {
    var in1 = outputArray(in1b);
    var in2 = outputArray(in2b);
    var limit = Math.min(in1.length, in2.length);
    var out = new Float32Array(limit);
    return {
      inputs: [in1b, in2b],
      output: out,
      run: function adder() {
        for (var i = 0; i < limit; i += 1) {
          out[i] = in1[i] + in2[i];
        }
      }
    };
  }
  blocks.Add = Add;
  
  function Multiply(iqin1b, iqin2b) {
    var iqin1 = outputArray(iqin1b);
    var iqin2 = outputArray(iqin2b);
    var limit = Math.min(iqin1.length, iqin2.length);
    var iqout = new Float32Array(limit);
    return {
      inputs: [iqin1b, iqin2b],
      output: iqout,
      run: function multiply() {
        for (var i = 0; i < limit; i += 2) {
          iqout[i]   = iqin1[i] * iqin2[i] - iqin1[i+1] * iqin2[i+1];
          iqout[i+1] = iqin1[i+1] * iqin2[i] + iqin1[i] * iqin2[i+1];
        }
      }
    };
  }
  blocks.Multiply = Multiply;
  
  function Rotator(iqinb, radiansPerSample) {
    var iqin = outputArray(iqinb);
    var limit = iqin.length;
    var iqout = new Float32Array(limit);
    return {
      inputs: [iqinb],
      output: iqout,
      run: function rotator() {
        var phase = 0;
        for (var i = 0; i < limit; i += 2) {
          var s = sin(phase);
          var c = cos(phase);
          iqout[i]   = c * iqin[i] - s * iqin[i+1];
          iqout[i+1] = s * iqin[i] + c * iqin[i+1];
          phase += radiansPerSample;
        }
        //phase = phase % TWOPI;
      }
    };
  }
  blocks.Rotator = Rotator;
  
  function Siggen(samples, radiansPerSampleFn) {
    var limit = samples * 2;
    var iqout = new Float32Array(limit);
    return {
      inputs: [],
      output: iqout,
      run: function siggen() {
        var phase = 0;
        var radiansPerSample = radiansPerSampleFn();
        for (var i = 0; i < limit; i += 2) {
          var c = cos(phase);
          iqout[i]   = cos(phase);
          iqout[i+1] = sin(phase);
          phase += radiansPerSample;
        }
      }
    };
  }
  blocks.Siggen = Siggen;
  
  function ArraySource(array, opt_func) {
    return {
      inputs: [],
      output: array,
      run: opt_func || function arraySourceNoop() {}
    };
  }
  blocks.ArraySource = ArraySource;
  
  function LinearInterpolator(iqinb, interpolation) {
    var iqin = outputArray(iqinb);
    interpolation = Math.floor(interpolation);
    var iqout = new Float32Array(iqin.length * interpolation);
    var limit = iqout.length;
    return {
      inputs: [iqinb],
      output: iqout,
      run: function linearInterpolator() {
        for (var j = 0; j < limit; j += 2) {
          var position = j / (interpolation*2);
          var index = Math.floor(position);
          var fraction = position - index;
          var complement = 1 - fraction;
          var i = index * 2;
          iqout[j]   = iqin[i] * complement + iqin[i+2] * fraction;
          iqout[j+1] = iqin[i + 1] * complement + iqin[i+3] * fraction;
        }
      }
    };
  }
  blocks.LinearInterpolator = LinearInterpolator;
  
  function ImpulseInterpolator(iqinb, interpolation) {
    var iqin = outputArray(iqinb);
    interpolation = Math.floor(interpolation);
    var half = Math.floor(interpolation / 4) * 2;
    var iqout = new Float32Array(iqin.length * interpolation);
    var inlimit = iqin.length;
    var outlimit = iqout.length;
    return {
      inputs: [iqinb],
      output: iqout,
      run: function impulseInterpolator() {
        var j;
        for (j = 0; j < outlimit; j += 1) {
          iqout[j] = 0;
        }
        for (var i = 0; i < inlimit; i += 2) {
          j = half + i * interpolation;
          iqout[j] = iqin[i];
          iqout[j + 1] = iqin[i + 1];
        }
      }
    };
  }
  blocks.ImpulseInterpolator = ImpulseInterpolator;
  
  function RepeatInterpolator(iqinb, interpolation) {
    var iqin = outputArray(iqinb);
    interpolation = Math.floor(interpolation);
    var iqout = new Float32Array(iqin.length * interpolation);
    var limit = iqin.length;
    return {
      inputs: [iqinb],
      output: iqout,
      run: function repeatInterpolator() {
        for (var i = 0; i < limit; i += 2) {
          var jlim = (i + 2) * interpolation;
          for (var j = i * interpolation; j < jlim; j += 2) {
            iqout[j] = iqin[i];
            iqout[j + 1] = iqin[i + 1];
          }
        }
      }
    };
  }
  blocks.RepeatInterpolator = RepeatInterpolator;
  
  function Mapper(inputb, map) {
    var input = outputArray(inputb);
    var output = new Float32Array(input.length);
    var limit = input.length;
    return {
      inputs: [inputb],
      output: output,
      run: function mapper() {
        for (var i = 0; i < limit; i++) {
          output[i] = map[input[i]];
        }
      }
    };
  }
  blocks.Mapper = Mapper;
  
  // TODO I forget what the proper name for this is
  function SymbolModulator(inputb, gain, array) {
    array = array.map(function (s) { return [s[0] * gain, s[1] * gain]; });
    var nbits = Math.round(Math.log2(array.length));
    var input = outputArray(inputb);
    var limit = Math.round(input.length / nbits);
    var output = new Float32Array(limit * 2);
    return {
      inputs: [inputb],
      output: output,
      run: function mapper() {
        for (var i = 0; i < limit; i++) {
          var code = 0;
          for (var j = 0; j < nbits; j++) {
            code = (code << 1) + input[i * nbits + j];
          }
          console.log(code);
          var symbol = array[code];
          output[i * 2] = symbol[0];
          output[i * 2 + 1] = symbol[1];
        }
      }
    };
  }
  blocks.SymbolModulator = SymbolModulator;
  
  exports.blocks = Object.freeze(blocks);
  
  function Graph(blocks) {
    blocks = topologicalSortAndExtend(blocks);
    var fns = blocks.map(function (block) { return block.run; });
    var limit = fns.length;
    return function graph() {
      for (var i = 0; i < limit; i++) {
        fns[i]();
      }
    };
  }
  exports.Graph = Graph;
  
  function topologicalSortAndExtend(startingBlocks) {
    var output = [];  // blocks in output order
    
    // parallel arrays
    //var arrays = [];
    var blocks = [];
    var records = [];
    
    // generate intermediate data structure
    var idGen = 0;
    function lookup(block) {
      var id = blocks.indexOf(block);
      if (id >= 0) {
        return records[id];
      }
      
      if (!block.inputs) {
        throw new Error('alleged block missing inputs property: ' + block);
      }
      if (!block.run) {
        throw new Error('alleged block missing run method: ' + block);
      }
      
      id = records.length;
      var record = {
        id: id,
        block: block,
        visiting: false,
        visited: false
      };
      blocks[id] = block;
      records[id] = record;
      return record;
    }
    
    function visit(block) {
      var record = lookup(block);
      if (record.visited) return;
      if (record.visiting) {
        throw new Error('cyclic graph');  // TODO give details
      }
      record.visiting = true;
      
      var inIds = [];
      record.block.inputs.forEach(function (inputBlock) {
        visit(inputBlock);
        inIds.push(lookup(inputBlock).id);
      });
      output.push(record.block);
      console.log(record.id, record.block.run.name, inIds);  // debug
      
      record.visited = true;
    }
    
    startingBlocks.forEach(visit);
    return output;
  }
  
  return Object.freeze(exports);
})();