// TODO: remove network module depenency
define(['../../client/widget'], function (widget) {
  'use strict';
  
  var sin = Math.sin;
  var cos = Math.cos;
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
      return [array[i * 2 + 1], array[i * 2], i * 1];
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
  
  function Graph(blocks) {
    var limit = blocks.length;
    return function graph() {
      for (var i = 0; i < limit; i++) {
        blocks[i]();
      }
    };
  }
  
  var ambuf = new Float32Array(sampleCount * 2);
  var amout = new Float32Array(sampleCount * 2);
  var g = Graph([
    AMModulator(audioarray, ambuf),
    Rotator(ambuf, amout, 0.2)
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
    
    mathbox.viewport({
      type: 'cartesian',
      range: [[-2, 2], [-2, 2], [0, sampleCount]],
      scale: [1, 1, 1]
    });
    mathbox.camera({
      orbit: 3.5,
      phi: Math.PI * 0.9,
      theta: Math.PI * 0.05,
    });
    
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
    function docurve(id, color, func) {
      mathbox.curve({
        id: id,
        color: color,
        n: sampleCount,
        live: true,
        domain: [0, Math.PI * 40],
        expression: func,
        lineWidth: 2,
      })
    }
    docurve('modulatingam', 0x000000, IQPlotter(ambuf));
    docurve('am', 0x0077FF, IQPlotter(amout));
    
    var mbscript = [];
    var mbdirector = new MathBox.Director(mathbox, mbscript);
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