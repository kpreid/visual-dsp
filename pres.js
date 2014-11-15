// TODO: remove network module depenency
define(['../../client/widget'], function (widget) {
  'use strict';
  
  var sin = Math.sin;
  var cos = Math.cos;
  var PI = Math.PI;
  var TWOPI = Math.PI * 2;
  
  var ctx = new webkitAudioContext();
  var sampleRate = ctx.sampleRate;
  var fftnode = ctx.createAnalyser();
  fftnode.smoothingTimeConstant = 0;
  fftnode.fftSize = 2048;
  // ignore mostly useless high freq bins
  var binCount = fftnode.frequencyBinCount / 2;
  var sampleCount = 128;  // can be up to fftSize but we want to 'zoom in'
  
  var fftarray = new Float32Array(binCount);
  var audioarray = new Float32Array(sampleCount);
  
  var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozUserMedia || navigator.msGetUserMedia;
  getUserMedia.call(navigator, {audio: true}, function getUserMediaSuccess(stream) {
    var source = ctx.createMediaStreamSource(stream);
    source.connect(fftnode);
  }, function getUserMediaFailure(e) {
    var d = document.createElement('dialog');
    d.textContent = e;
    document.body.appendChild(d);
    d.show();
  });
  
  
  function ToComplex(audioin, iqout) {
    var limit = Math.min(audioin.length, iqout.length / 2);
    return function toComplex() {
      for (var i = 0, j = 0; i < limit; i++, j += 2) {
        iqout[j] = audioin[i];
        iqout[j+1] = 0;
      }
    };
  }

  function AMModulator(audioin, iqout) {
    var limit = Math.min(audioin.length, iqout.length / 2);
    return function amModulator() {
      for (var i = 0, j = 0; i < limit; i++, j += 2) {
        iqout[j] = 1 + audioin[i];
        iqout[j+1] = 0;
      }
    };
  }

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
  
  var logged = false;
  function FIRFilter(in1, out, step, delay, taps) {
    var ntaps = taps.length;
    var valdelay = delay * step;
    var start = Math.min(out.length, Math.max(0, valdelay));
    var limit = Math.min(Math.max(0, in1.length - ntaps + valdelay), out.length);
    var end = out.length;
    //console.log('FIRFilter', taps, 0, start, limit, end);
    return function filterer() {
      var i = 0;
      for (; i < start; i++) {
        out[i] = 0;
      }
      for (; i < limit; i++) {
        var accum = 0;
        for (var j = 0; j < ntaps * step; j += step) {
          //if (!logged) console.log(i - delay + j, in1[i - delay + j], Math.floor(j / step)), taps[Math.floor(j / step)];
          accum += in1[i - valdelay + j] * taps[Math.floor(j / step)];
        }
        //if (!logged) console.log('logged', accum);
        //logged = true;
        out[i] = accum;
      }
      for (; i < end; i++) {
        out[i] = 0;
      }
    };
  }
  function Add(in1, in2, out) {
    var limit = Math.min(in1.length, in2.length, out.length);
    return function adder() {
      for (var i = 0; i < limit; i += 1) {
        out[i] = in1[i] + in2[i];
      }
    };
  }
  function Multiply(iqin1, iqin2, iqout) {
    var limit = Math.min(iqin1.length, iqin2.length, iqout.length);
    return function rotator() {
      for (var i = 0; i < limit; i += 2) {
        iqout[i]   = iqin1[i] * iqin2[i] - iqin1[i+1] * iqin2[i+1];
        iqout[i+1] = iqin1[i+1] * iqin2[i] + iqin1[i] * iqin2[i+1];
      }
    };
  }
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
  function Interpolator(iqin, iqout) {
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
  
  function Graph(blocks) {
    var limit = blocks.length;
    return function graph() {
      for (var i = 0; i < limit; i++) {
        blocks[i]();
      }
    };
  }
  
  var filterOuterCoeff = 1/3;
  var filterInnerCoeff = 2/3;
  
  // firdes.low_pass(1, 44100, 1000, 2000)
  var audio_lowpass = [-0.00114539940841496, -0.0007444394868798554, 2.997766569023952e-05, 0.0019656415097415447, 0.005893126595765352, 0.01247603353112936, 0.02201135642826557, 0.034287191927433014, 0.04853496327996254, 0.06349427998065948, 0.07758451253175735, 0.0891534835100174, 0.09675595909357071, 0.09940661489963531, 0.09675595909357071, 0.0891534835100174, 0.07758451253175735, 0.06349427998065948, 0.04853496327996254, 0.034287191927433014, 0.02201135642826557, 0.01247603353112936, 0.005893126595765352, 0.0019656415097415447, 2.997766569023952e-05, -0.0007444394868798554, -0.00114539940841496];
  var audio_highpass = [0.0010463938815519214, 0.0006800920236855745, -2.738647162914276e-05, -0.0017957363743335009, -0.005383739247918129, -0.011397636495530605, -0.020108748227357864, -0.03132349252700806, -0.04433972015976906, -0.05800599604845047, -0.07087830454111099, -0.08144728094339371, -0.08839261531829834, 0.9104118347167969, -0.08839261531829834, -0.08144728094339371, -0.07087830454111099, -0.05800599604845047, -0.04433972015976906, -0.03132349252700806, -0.020108748227357864, -0.011397636495530605, -0.005383739247918129, -0.0017957363743335009, -2.738647162914276e-05, 0.0006800920236855745, 0.0010463938815519214];
  
  var interpolation = 5;
  var chfreq = 0.30;
  var ambuf = new Float32Array(sampleCount * 2);
  var dsbbuf = new Float32Array(sampleCount * 2);
  var hfbuf = new Float32Array(interpolation * sampleCount * 2);
  var amout = new Float32Array(interpolation * sampleCount * 2);
  var demodrot = new Float32Array(interpolation * sampleCount * 2);
  var product = new Float32Array(interpolation * sampleCount * 2);
  var audioh = new Float32Array(sampleCount * 2);
  var audiol = new Float32Array(sampleCount * 2);
  var g = Graph([
    AMModulator(audioarray, ambuf),
    Interpolator(ambuf, hfbuf),
    Rotator(hfbuf, amout, chfreq),
    Siggen(demodrot, function() { return (mbdirector && mbdirector.step == demodStep ? Math.min(mbdirector.clock(demodStep) * 0.08, 1) : 0) * -chfreq; }),
    Multiply(amout, demodrot, product),
    ToComplex(audioarray, dsbbuf),
    FIRFilter(dsbbuf, audiol, 2, -Math.floor(audio_lowpass.length / 2), audio_lowpass),
    FIRFilter(dsbbuf, audioh, 2, -Math.floor(audio_lowpass.length / 2), audio_highpass),
  ]);
  
  var twosig1 = new Float32Array(sampleCount * 2);
  var twosig2 = new Float32Array(sampleCount * 2);
  var twosig = new Float32Array(sampleCount * 2);
  var twosigl = new Float32Array(sampleCount * 2);
  var twosigh = new Float32Array(sampleCount * 2);
  Graph([
    Siggen(twosig1, function() { return 0.3; }),
    Siggen(twosig2, function() { return 10; }),
    Add(twosig1, twosig2, twosig),
    FIRFilter(twosig, twosigl, 2, -0, [filterOuterCoeff, filterInnerCoeff, filterOuterCoeff]),  // 2 for complex
    FIRFilter(twosig, twosigh, 2, -0, [-filterOuterCoeff, filterInnerCoeff, -filterOuterCoeff]),  // 2 for complex
  ])();
  
  var mbdirector, demodStep = 4;
  ThreeBox.preload(['../../client/mathbox.glsl.html'], goMathbox);
  function goMathbox() {
    var element = document.getElementById('mb');
    var mathbox = mathBox(element, {
      cameraControls: true,
      controlClass: ThreeBox.OrbitControls,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000),
      scale: 1
    }).start();
    
    var timeRangeScale = 6;
    
    var vs = 0.4;
    mathbox.viewport({
      type: 'cartesian',
      range: [[-2, 2], [-2, 2], [-timeRangeScale, timeRangeScale]],
      scale: [-1*vs, 1*vs, timeRangeScale*vs]
    });
    mathbox.camera({
      orbit: 6,
      phi: PI,
      theta: 0.05
    });
    mathbox.transition(500);
    
    function axisi(v) { return v == 2 ? 'I' : ''; }
    function axisq(v) { return v == 2 ? 'Q' : ''; }
    mathbox.axis({
      id: 'iaxis',
      axis: 1,
      color: 0x777777,
      ticks: 3,
      lineWidth: 2,
      size: .05,
      arrow: false,
      labels: false,
      formatter: axisi
    });
    mathbox.axis({
      id: 'qaxis',
      axis: 0,
      color: 0x777777,
      ticks: 3,
      lineWidth: 2,
      size: .05,
      arrow: false,
      labels: false,
      formatter: axisq
    });
    mathbox.axis({
      id: 'taxis',
      axis: 2,
      color: 0x777777,
      ticks: 3,
      lineWidth: 2,
      size: .05,
      arrow: true
    });
    
    // wave
    function docurve(id, color, array1, array2) {
      return {
        id: id,
        color: color,
        n: array1.length / 2,
        live: true,
        domain: [-timeRangeScale, timeRangeScale],
        expression: function (x, i) {
          var k = this.get('ksiginterp');
          if (k > 0) {
            return [array1[i * 2 + 1] * (1-k) + array2[i * 2 + 1] * k, array1[i * 2] * (1-k) + array2[i * 2] * k, x];
          } else {
            return [array1[i * 2 + 1], array1[i * 2], x];
          }
        },
        lineWidth: 2,
        ksiginterp: 0,
      }
    }
    mathbox.curve(docurve('modulatingam', 0x000000, ambuf));
    mathbox.curve(docurve('product', 0x0077FF, product));
    
    var step0 = [
      'Amplitude modulation (AM)',
      'This is a depiction of amplitude modulation as commonly understood. The modulating audio signal, in black, is offset above zero and then used to control the amplitude of the carrier signal — that is, they are multiplied — and the result is the signal shown in blue.'
    ]
    var script = [
      [
        'Amplitude modulation (AM)',
        'The problem with this picture, for our purposes, is that the math is messy. For example, if you were trying to demodulate this, every time the signal crosses zero, you have no data because the audio was multiplied by zero. Of course, in reality the carrier frequency is immensely higher than the audio frequency, so it\'s easy to average over that. It\'s not that it\'s infeasible to work this way — you can, in exact analogy to analog RF electronics, but rather that there\'s something else you can do which is much more elegant all around. It doesn\'t matter as much for AM, but I\'m using AM in this picture because it makes good pictures, not because it\'s a good example.'
      ],
      [
        'Analytic signals',
        'Here we have a signal which has values which are complex numbers rather than real numbers. The carrier wave is a complex sinusoid. The modulation works exactly the same way — multiplying the complex carrier by the real audio scales the magnitude of the carrier. (We will see later how this picture corresponds to physical radio signals.)',
        ['set', '#iaxis', {labels: true}],
        ['set', '#qaxis', {labels: true}],
        ['animate', 'camera', {
          phi: Math.PI * 0.7,
          theta: 0.05
        }, {
          delay: 0,
          duration: 6000
        }],
      ],
      [
        'Frequency selection and demodulation',
        'So how do we demodulate this analytic signal? For AM, it turns out we can simply take the magnitude of these complex signals and we\'re done. But in general, the first step is to undo the effect of the carrier.',
        ['remove', '#modulatingam']
      ],
      [
        'Frequency selection and demodulation',
        'We do this by multiplying the signal by another complex sinusoid, shown in red, of equal and opposite frequency. This is a negative frequency — the helix is wound the other way. You can also call it the complex conjugate of the carrier, the number with the imaginary component negated. This cancels out the original carrier wave, giving us the modulating signal again. In general, this technique allows you to change the frequency of an arbitrary signal, adding or subtracting an offset.',
        ['add', 'curve', docurve('demodrot', 0xFF0000, demodrot)],
        //['animate', '#demodrot', { /* dummy */ }, {
        //  duration: 1000
        //}]
      ],
      [
        'Sampling and the Nyquist frequency',
        'Up until now, the pictures I\'ve been showing you have had solid lines. This is an accurate depiction of analog signals, but in DSP we are working with only a finite amount of data — the signal is sampled at fixed time intervals, producing a sequence of numbers. This graph is the exact same signal showing only the sample points. Generally, you want the sampling rate to be as slow as possible, to minimize the computation needed. However, there is a fundamental limit known as the Nyquist frequency.',
        ['remove', '#demodrot'],
        ['set', '#product', {
          points: true,
          line: false,
        }],
        ['animate', 'camera', {
          phi: Math.PI,
          theta: 0.05
        }, {
          delay: 0,
          duration: 1000
        }],
      ],
      [
        'Sampling and the Nyquist frequency',
        'What you are seeing here is the instantaneous value of a sampled signal. The signal is a sinusoid with a frequency which is continuously increasing. As it increases, it appears to reverse, because the frequency is so high that it completes more than half of a complete cycle between every two samples. This is the Nyquist frequency — one-half of the sampling rate. A signal of some frequency f, when sampled, is exactly the same as a signal of frequency f plus the sampling rate.',
        ['remove', '#product'],
        ['animate', 'camera', {
          phi: Math.PI / 2,
          theta: 0.00
        }, {
          delay: 0,
          duration: 1000
        }],
        ['add', 'curve', {
          id: 'clockface',
          color: 0x000000,
          n: 2,
          live: true,
          points: true,
          line: true,
          domain: [-timeRangeScale, timeRangeScale],
          expression: (function() { var frame = 0, phase = 0; return function (x, n) {
            if (n == 0) {
              return [0, 0, 0];
            } else {
              frame++;
              var t = frame / 2000;
              var rate = 0.5 * (1 + sin(PI * (t % 1 - 0.5))) + Math.floor(t);
              phase += (rate * 1.016) * TWOPI;
              return [sin(phase) * 3, cos(phase) * 3, 0];
            }
          }})(),
          lineWidth: 2,
        }]
      ],
      [
        'Sampling and the Nyquist frequency',
        'Frequencies in digital signal processing are points on a circle — they are modulo the sampling frequency. We usually think of them as having a range of plus or minus the Nyquist frequency, because the symmetry is useful. But since nothing in the math and physics respects that limit, we have to do it ourselves, by _filtering_. In a software-defined receiver, we filter using analog circuits to remove frequencies above the Nyquist frequency before sampling the signal. This removes the ambiguity and allows us to treat the frequencies in our digital signal as if they were not circular.',
      ],
      [
        'Filtering',
        'Filtering is also useful for sampled digital signals, to allow us to reduce or increase the sample rate, or to separate a particular signal from nearby irrelevant signals and noise. Digital filters can be much more precise than analog filters, and they can be adjusted by changing data rather than changing circuits. To illustrate filtering, here is an example signal which is the combination — the sum — of two components of different frequencies. It\'s very far from the nice helixes we\'ve seen so far.',
        ['remove', '#clockface'],
        ['animate', 'camera', {
          phi: Math.PI,
          theta: 0.00
        }, {
          delay: 500,
          duration: 1000
        }],
        ['add', 'curve', docurve('twosig', 0x000000, twosig, twosigl)],
      ],
      [
        'Finite impulse response (FIR) filters',
        'I\'m going to cover a simple and widely useful class of digital filters called finite impulse response filters. FIR filters operate by taking delayed copies of the input signal, scaling them, and adding them together. In this picture, the copies have amplitudes of one-third, two-thirds, and one-third.',
        ['add', 'curve', docurve('twosigp', 0xFF2222, twosig)],
        ['add', 'curve', docurve('twosign', 0x00EE00, twosig)],
        ['animate', '#twosigp', {
          mathPosition: [0, 0, timeRangeScale / sampleCount * 2],
        }, {
          duration: 1000,
        }],
        ['animate', '#twosign', {
          mathPosition: [0, 0, -timeRangeScale / sampleCount * 2],
        }, {
          duration: 1000,
        }],
        ['animate', '#twosig', {
          mathScale: [filterInnerCoeff, filterInnerCoeff, 1],
        }, {
          delay: 1000,
          duration: 1000,
        }],
        ['animate', '#twosigp', {
          mathScale: [filterOuterCoeff, filterOuterCoeff, 1],
        }, {
          delay: 1000,
          duration: 1000,
        }],
        ['animate', '#twosign', {
          mathScale: [filterOuterCoeff, filterOuterCoeff, 1],
        }, {
          delay: 1000,
          duration: 1000,
        }],
      ],
      [
        'Low-pass filter',
        'When those three are added together, the result contains mostly the low-frequency component of the input signal and not the high-frequency component. This kind of filter is called a low-pass filter. It\'s not a very good one — good filters have systematically chosen coefficients for the scaling, and have many more of them. These coefficients, I should mention, are called the _taps_ of the filter. The name comes from the notion of feeding the input samples into a delay line, then taking the values from taps off the line at successive positions simultaneously.',
        ['animate', '#twosig', {
          ksiginterp: 1,
          mathScale: [1, 1, 1],
        }, {
          duration: 1000,
        }],
        ['animate', '#twosigp', {
          mathScale: [0, 0, 1],
          opacity: 0,
        }, {
          duration: 1000,
        }],
        ['animate', '#twosign', {
          mathScale: [0, 0, 1],
          opacity: 0,
        }, {
          duration: 1000,
        }],
      ],
      [
        'High-pass filter',
        'If instead of adding the three copies we subtract the outer ones from the middle one, the filter becomes a high-pass filter, keeping the high-frequency component instead of the low-frequency one.',
        ['remove', '#twosig'],
        ['add', 'curve', docurve('twosigh', 0x000000, twosig, twosigh)],
        ['animate', '#twosigp', {
          mathScale: [filterOuterCoeff, filterOuterCoeff, 1],
          opacity: 1,
        }, {
          duration: 10,
        }],
        ['animate', '#twosign', {
          mathScale: [filterOuterCoeff, filterOuterCoeff, 1],
          opacity: 1,
        }, {
          duration: 10,
        }],
        ['animate', '#twosigp', {
          mathScale: [-filterOuterCoeff, -filterOuterCoeff, 1],
        }, {
          delay: 10,
          duration: 900,
        }],
        ['animate', '#twosign', {
          mathScale: [-filterOuterCoeff, -filterOuterCoeff, 1],
        }, {
          delay: 10,
          duration: 900,
        }],
        ['animate', '#twosigh', {
          ksiginterp: 1
        }, {
          delay: 1000,
          duration: 1000,
        }],
        ['animate', '#twosigp', {
          mathScale: [0, 0, 1],
          opacity: 0,
        }, {
          delay: 1000,
          duration: 1000,
        }],
        ['animate', '#twosign', {
          mathScale: [0, 0, 1],
          opacity: 0,
        }, {
          delay: 1000,
          duration: 1000,
        }],
      ],
      [
        'Live Filter',
        'Here\'s the same filters applied to live audio; high-pass in green, low-pass in red.',
        ['remove', '#twosign'],
        ['remove', '#twosigp'],
        ['remove', '#twosigh'],
        ['add', 'curve', docurve('audio', 0x0000FF, dsbbuf)],
        ['add', 'curve', docurve('audioh', 0x00DD00, audioh)],
        ['add', 'curve', docurve('audiol', 0xFF0000, audiol)],
      ],
    ];
    var mbscript = script.map(function(step) { return step.slice(2); });
    mbdirector = new MathBox.Director(mathbox, mbscript);
    
    document.body.addEventListener('keydown', function (event) {
      if (event.keyCode == 39) {
        mbdirector.forward();
      }
      if (event.keyCode == 37) {
        mbdirector.back();
      }
      console.log('Now at step ', mbdirector.step);
    }, false);
    //setTimeout(function() {
    //  mbdirector.forward();
    //}, 1000);
    mbdirector.go(script.length);
    
    setInterval(function() {
      var step = mbdirector.step;
      document.getElementById('slidetitle').textContent = (step ? script[step - 1] : step0)[0];
      document.getElementById('slidecaption').textContent = (step ? script[step - 1] : step0)[1];
    }, 20);
  }
  
  var paused = false;
  document.body.addEventListener('keydown', function (event) {
    if (event.keyCode == 0x20) {
      paused = !paused;
    }
  }, false);
  
  var audioTriggerArray = new Float32Array(fftnode.fftSize);
  function updateFFT() {
    if (paused) return;
    
    fftnode.getFloatFrequencyData(fftarray);
    fftnode.getFloatTimeDomainData(audioTriggerArray);
    var outLengthHalf = Math.floor(audioarray.length / 2);
    var limit = fftnode.fftSize - outLengthHalf - 1;
    // rising edge trigger
    for (var i = outLengthHalf; i < limit; i++) {
      if (audioTriggerArray[i] <= 0 && audioTriggerArray[i + 1] > 0) {
        break;
      }
    }
    audioarray.set(audioTriggerArray.subarray(i - outLengthHalf, i + outLengthHalf));
    
    g();
  }
  
  function loop() {
    updateFFT();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  
  //widget.createWidgets(root, context, document);
});