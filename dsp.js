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
  
  function ToComplex(audioin, iqout) {
    var limit = Math.min(audioin.length, iqout.length / 2);
    return function toComplex() {
      for (var i = 0, j = 0; i < limit; i++, j += 2) {
        iqout[j] = audioin[i];
        iqout[j+1] = 0;
      }
    };
  }
  blocks.ToComplex = ToComplex;

  function AMModulator(audioin, iqout) {
    var limit = Math.min(audioin.length, iqout.length / 2);
    return function amModulator() {
      for (var i = 0, j = 0; i < limit; i++, j += 2) {
        iqout[j] = 1 + audioin[i];
        iqout[j+1] = 0;
      }
    };
  }
  blocks.AMModulator = AMModulator;

  function FMModulator(audioin, iqout, deviation) {
    var limit = Math.min(audioin.length, iqout.length / 2);
    return function fmModulator() {
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
    };
  }
  blocks.FMModulator = FMModulator;
  
  function FIRFilter(in1, out, step, delay, taps) {
    var ntaps = taps.length;
    var valdelay = delay * step;
    var start = Math.min(out.length, Math.max(0, valdelay));
    var limit = Math.min(Math.max(0, in1.length - ntaps - valdelay), out.length);
    var end = out.length;
    return function filterer() {
      var i = 0;
      for (; i < start; i++) {
        out[i] = 0;
      }
      for (; i < limit; i++) {
        var accum = 0;
        for (var j = 0; j < ntaps * step; j += step) {
          accum += in1[i + valdelay + j] * taps[Math.floor(j / step)];
        }
        out[i] = accum;
      }
      for (; i < end; i++) {
        out[i] = 0;
      }
    };
  }
  blocks.FIRFilter = FIRFilter;
  
  function Add(in1, in2, out) {
    var limit = Math.min(in1.length, in2.length, out.length);
    return function adder() {
      for (var i = 0; i < limit; i += 1) {
        out[i] = in1[i] + in2[i];
      }
    };
  }
  blocks.Add = Add;
  
  function Multiply(iqin1, iqin2, iqout) {
    var limit = Math.min(iqin1.length, iqin2.length, iqout.length);
    return function rotator() {
      for (var i = 0; i < limit; i += 2) {
        iqout[i]   = iqin1[i] * iqin2[i] - iqin1[i+1] * iqin2[i+1];
        iqout[i+1] = iqin1[i+1] * iqin2[i] + iqin1[i] * iqin2[i+1];
      }
    };
  }
  blocks.Multiply = Multiply;
  
  function Rotator(iqin, iqout, radiansPerSample) {
    var limit = Math.min(iqin.length, iqout.length);
    return function rotator() {
      var phase = 0;
      for (var i = 0; i < limit; i += 2) {
        var s = sin(phase);
        var c = cos(phase);
        iqout[i]   = c * iqin[i] - s * iqin[i+1];
        iqout[i+1] = s * iqin[i] + c * iqin[i+1];
        phase += radiansPerSample;
      }
      //phase = phase % TWOPI;
    };
  }
  blocks.Rotator = Rotator;
  
  function Siggen(iqout, radiansPerSampleFn) {
    var limit = iqout.length;
    return function siggen() {
      var phase = 0;
      var radiansPerSample = radiansPerSampleFn();
      for (var i = 0; i < limit; i += 2) {
        var c = cos(phase);
        iqout[i]   = cos(phase);
        iqout[i+1] = sin(phase);
        phase += radiansPerSample;
      }
    };
  }
  blocks.Siggen = Siggen;
  
  function LinearInterpolator(iqin, iqout) {
    var interpolation = Math.floor(iqout.length / iqin.length);
    var limit = iqout.length;
    return function interpolator() {
      for (var j = 0; j < limit; j += 2) {
        var position = j / (interpolation*2);
        var index = Math.floor(position);
        var fraction = position - index;
        var complement = 1 - fraction;
        var i = index * 2;
        iqout[j]   = iqin[i] * complement + iqin[i+2] * fraction;
        iqout[j+1] = iqin[i + 1] * complement + iqin[i+3] * fraction;
      }
    };
  }
  blocks.LinearInterpolator = LinearInterpolator;
  
  exports.blocks = Object.freeze(blocks);
  
  function Graph(blocks) {
    var limit = blocks.length;
    return function graph() {
      for (var i = 0; i < limit; i++) {
        blocks[i]();
      }
    };
  }
  exports.Graph = Graph;
  
  return Object.freeze(exports);
})();