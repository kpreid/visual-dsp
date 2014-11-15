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
  function Interpolator(iqin, iqout) {
    var interpolation = Math.floor(iqout.length / iqin.length);
    var limit = iqout.length;
    return function interpolator() {
      for (var j = 0; j < limit; j += 2) {
        var i = Math.floor(j / (interpolation*2))*2;
        iqout[j]   = iqin[i];
        iqout[j+1] = iqin[i + 1];
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
  var g = Graph([
    AMModulator(audioarray, ambuf),
    Interpolator(ambuf, hfbuf),
    Rotator(hfbuf, amout, 0.15)
  ]);
  
  ThreeBox.preload(['../../client/mathbox.glsl.html'], goMathbox);
  function goMathbox() {
    var element = document.getElementById('mb');
    var mathbox = mathBox(element, {
      cameraControls: true,
      controlClass: ThreeBox.OrbitControls,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000),
      scale: 1
    }).start();
    
    var timeRangeScale = 4;
    
    var vs = 0.4;
    mathbox.viewport({
      type: 'cartesian',
      range: [[-2, 2], [-2, 2], [-timeRangeScale, timeRangeScale]],
      scale: [1*vs, 1*vs, timeRangeScale*vs]
    });
    mathbox.camera({
      orbit: 6,
      phi: PI,
      theta: 0.05
    });
    mathbox.transition(500);
    
    mathbox.axis({
      id: 'iaxis',
      axis: 0,
      color: 0x777777,
      ticks: 3,
      lineWidth: 2,
      size: .05,
      arrow: false,
    });
    mathbox.axis({
      id: 'qaxis',
      axis: 1,
      color: 0x777777,
      ticks: 3,
      lineWidth: 2,
      size: .05,
      arrow: false,
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
      mathbox.curve({
        id: id,
        color: color,
        n: array.length / 2,
        live: true,
        domain: [-timeRangeScale, timeRangeScale],
        expression: IQPlotter(array),
        lineWidth: 2,
      })
    }
    docurve('modulatingam', 0x000000, ambuf);
    docurve('am', 0x0077FF, amout);
    
    var mbscript = [
      [
        ['animate', 'camera', {
          phi: Math.PI * 0.8,
          theta: 0.05
        }, {
          delay: 0,
          duration: 6000
        }],
        //['animate', 'camera', {
        //  phi: Math.PI * 0.6,
        //  //theta: Math.PI * 0.3
        //}, {
        //  delay: 4000,
        //  duration: 2000
        //}],
      ],
    ];
    var mbdirector = new MathBox.Director(mathbox, mbscript);
    
    document.body.addEventListener('keydown', function (event) {
      if (event.keyCode == 39) {
        mbdirector.forward();
      }
      if (event.keyCode == 37) {
        mbdirector.back();
      }
      console.log(event.keyCode, mbdirector.step);
    }, false);
    setTimeout(function() {
      mbdirector.forward();
    }, 1000);
  }
  
  var audioTriggerArray = new Float32Array(fftnode.fftSize);
  function updateFFT() {
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