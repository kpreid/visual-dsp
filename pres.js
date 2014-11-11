// TODO: remove network module depenency
define(['../../client/widget'], function (widget) {
  'use strict';
  
  var ctx = new webkitAudioContext();
  var sampleRate = ctx.sampleRate;
  var fftnode = ctx.createAnalyser();
  fftnode.smoothingTimeConstant = 0;
  fftnode.fftSize = 2048;
  // ignore mostly useless high freq bins
  var binCount = fftnode.frequencyBinCount / 2;
  
  var fftarray = new Float32Array(binCount);
  var audioarray = new Float32Array(fftnode.fftSize);
  
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
  
  ThreeBox.preload(['../../client/mathbox.glsl.html'], goMathbox);
  
  function goMathbox() {
    var element = document.getElementById('mb');
    var mathbox = mathBox(element, {
      cameraControls: true,
      controlClass: ThreeBox.OrbitControls,
      scale: 1
    }).start();
    
    mathbox.viewport({
      type: 'cartesian',
      range: [[-2, 2], [-2, 2], [0, binCount]],
      scale: [1, 1, 1]
    });
    mathbox.camera({
      orbit: 4.0,
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
    mathbox.curve({
      id: 'wave',
      n: binCount,
      live: true,
      domain: [0, 1],
      expression: function (x, i) {
        return [0, audioarray[i], i * 1];
      },
      lineWidth: 2,
    })
    
    var mbscript = [];
    var mbdirector = new MathBox.Director(mathbox, mbscript);
  }
  
  function updateFFT() {
    fftnode.getFloatFrequencyData(fftarray);
    fftnode.getFloatTimeDomainData(audioarray);
  }
  
  function loop() {
    updateFFT();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  
  //widget.createWidgets(root, context, document);
});