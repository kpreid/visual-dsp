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
  
  
  function IQPlotter(array) {
    return function (x, i) {
      return [array[i * 2 + 1], array[i * 2], x];
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
  
  var interpolation = 10;
  var ambuf = new Float32Array(sampleCount * 2);
  var hfbuf = new Float32Array(interpolation * sampleCount * 2);
  var amout = new Float32Array(interpolation * sampleCount * 2);
  var demodrot = new Float32Array(interpolation * sampleCount * 2);
  var product = new Float32Array(interpolation * sampleCount * 2);
  var g = Graph([
    AMModulator(audioarray, ambuf),
    Interpolator(ambuf, hfbuf),
    Rotator(hfbuf, amout, 0.15),
    Siggen(demodrot, function() { return (mbdirector ? Math.min(mbdirector.clock(demodStep) * 0.08, 1) : 0) * -0.15; }),
    Multiply(amout, demodrot, product),
  ]);
  
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
    function docurve(id, color, array) {
      return {
        id: id,
        color: color,
        n: array.length / 2,
        live: true,
        domain: [-timeRangeScale, timeRangeScale],
        expression: IQPlotter(array),
        lineWidth: 2,
      }
    }
    mathbox.curve(docurve('modulatingam', 0x000000, ambuf));
    mathbox.curve(docurve('am', 0x0077FF, product));
    mathbox.curve();
    
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
        'We do this by multiplying the signal by another complex sinusoid, shown in red, of equal and opposite frequency — the helix is wound the other way.',
        ['add', 'curve', docurve('demodrot', 0xFF0000, demodrot)],
        //['animate', '#demodrot', { /* dummy */ }, {
        //  duration: 1000
        //}]
      ]
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
    mbdirector.go(3);
    
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