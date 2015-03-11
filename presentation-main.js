/*
Copyright © 2014, 2015 Kevin Reid

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
(function () {
  'use strict';
  
  var DSP = VisualDSP_DSP;
  
  var sin = Math.sin;
  var cos = Math.cos;
  var PI = Math.PI;
  var TWOPI = Math.PI * 2;
  
  function reportFailure(error) {
    var d = document.createElement('dialog');
    d.textContent = String(error);
    d.className = 'dialog-on-top';

    var b = d.appendChild(document.createElement('button'));
    b.textContent = 'OK';
    b.addEventListener('click', function (event) {
      d.parentNode.removeChild(d);
    }, false);

    document.body.appendChild(d);
    if (d.show) { // <dialog> supported
      d.show();
    } else {
      // nothing needed, will be auto-visible
    }
  }
  
  var AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    reportFailure('This browser does not support Web Audio API.');
    return;
  }
  
  var ctx = new AudioContext();
  var sampleRate = ctx.sampleRate;
  var fftnode = ctx.createAnalyser();
  fftnode.smoothingTimeConstant = 0;
  fftnode.fftSize = 2048;
  // ignore mostly useless high freq bins
  var binCount = fftnode.frequencyBinCount / 2;
  var sampleCount = 128;  // can be up to fftSize but we want to 'zoom in'
  
  var fftarray = new Float32Array(binCount);
  var audioarray = new Float32Array(sampleCount);
  
  var userGainNode = ctx.createGain();
  var userGainEl = document.getElementById('gain');
  function updateGain() {
    userGainNode.gain.value = Math.pow(10, userGainEl.valueAsNumber / 10);
  }
  updateGain();
  userGainEl.addEventListener('change', updateGain, false);
  userGainEl.addEventListener('input', updateGain, false);
  
  var sources = Object.create(null);
  var sourceSelectEl = document.getElementById('source-select');
  sources['sig'] = (function() {
    var osc1 = ctx.createOscillator();
    osc1.frequency.value = sampleRate / 30;
    osc1.start();
    var gain1 = ctx.createGain();
    gain1.gain.value = 0.5;
    var osc2 = ctx.createOscillator();
    osc2.frequency.value = osc1.frequency.value * 5;
    osc2.start();
    var gain2 = ctx.createGain();
    gain2.gain.value = 0.5;
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain2.connect(gain1);
    return gain1;
  }());
  var currentSource = null;
  function wireSource() {
    if (currentSource !== null) {
      currentSource.disconnect(fftnode);
    }
    currentSource = sources[sourceSelectEl.value] || null;
    if (currentSource === null && sourceSelectEl.value == 'user') {
      currentSource = sources['sig'];
    }
    console.log('switching to', sourceSelectEl.value, currentSource);
    if (currentSource !== null) {
      currentSource.connect(userGainNode);
    }
  }
  wireSource();
  sourceSelectEl.addEventListener('change', wireSource, false);
  
  userGainNode.connect(fftnode);
  
  var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  if (!getUserMedia) {
    reportFailure('This browser does not support getUserMedia. No signal will be shown.');
    // don't abort, we can at least show the slides
  } else {
    getUserMedia.call(navigator, {audio: true}, function getUserMediaSuccess(stream) {
      var source = ctx.createMediaStreamSource(stream);
      sources['user'] = source;
      wireSource();
      
      // https://bugzilla.mozilla.org/show_bug.cgi?id=934512
      // http://stackoverflow.com/q/22860468/99692
      // Firefox destroys the media stream source even though it is in use by the audio graph. As a workaround, make a powerless global reference to it.
      // TODO: moot now
      window[Math.random()] = function() { console.log(source); }
    }, function (error) {
      console.error('error response from getUserMedia:', error);
      var option = sourceSelectEl.querySelector('option[value="user"]');
      option.textContent += ' (unavailable)';
      option.disabled = true;
      if (sourceSelectEl.value === 'user') sourceSelectEl.value = 'sig';
    });
  }
  
  var filterOuterCoeff = 1/3;
  var filterInnerCoeff = 2/3;
  
  // firdes.low_pass(1, 44100, 1000, 2000)
  var audio_lowpass = [-0.00114539940841496, -0.0007444394868798554, 2.997766569023952e-05, 0.0019656415097415447, 0.005893126595765352, 0.01247603353112936, 0.02201135642826557, 0.034287191927433014, 0.04853496327996254, 0.06349427998065948, 0.07758451253175735, 0.0891534835100174, 0.09675595909357071, 0.09940661489963531, 0.09675595909357071, 0.0891534835100174, 0.07758451253175735, 0.06349427998065948, 0.04853496327996254, 0.034287191927433014, 0.02201135642826557, 0.01247603353112936, 0.005893126595765352, 0.0019656415097415447, 2.997766569023952e-05, -0.0007444394868798554, -0.00114539940841496];
  var audio_highpass = [0.0010463938815519214, 0.0006800920236855745, -2.738647162914276e-05, -0.0017957363743335009, -0.005383739247918129, -0.011397636495530605, -0.020108748227357864, -0.03132349252700806, -0.04433972015976906, -0.05800599604845047, -0.07087830454111099, -0.08144728094339371, -0.08839261531829834, 0.9104118347167969, -0.08839261531829834, -0.08144728094339371, -0.07087830454111099, -0.05800599604845047, -0.04433972015976906, -0.03132349252700806, -0.020108748227357864, -0.011397636495530605, -0.005383739247918129, -0.0017957363743335009, -2.738647162914276e-05, 0.0006800920236855745, 0.0010463938815519214];
  
  var interpolation = 5;
  var chfreq = 0.30;
  
  var audioin = DSP.blocks.ArraySource(audioarray);
  var modulatingam = DSP.blocks.AMModulator(audioin);
  var modulatingfm = DSP.blocks.FMModulator(audioin, 0.75);
  var dsbbuf = DSP.blocks.ToComplex(audioin);
  var hfambuf = DSP.blocks.LinearInterpolator(modulatingam, interpolation);
  var hffmbuf = DSP.blocks.LinearInterpolator(modulatingfm, interpolation);
  var amout = DSP.blocks.Rotator(hfambuf, chfreq);
  var fmout = DSP.blocks.Rotator(hffmbuf, chfreq);
  var demodrot = DSP.blocks.Siggen(interpolation * sampleCount, function() { return (mbdirector && mbdirector.step == demodStep ? Math.min(mbdirector.clock(demodStep) * 0.08, 1) : 0) * -chfreq; });
  var product = DSP.blocks.Multiply(fmout, demodrot);
  var audioh = DSP.blocks.FIRFilter(dsbbuf, 2, -Math.floor(audio_lowpass.length / 2), audio_highpass);
  var audiol = DSP.blocks.FIRFilter(dsbbuf, 2, -Math.floor(audio_lowpass.length / 2), audio_lowpass);
  
  var g = DSP.Graph([
    modulatingam,
    modulatingfm,
    dsbbuf,
    amout,
    fmout,
    product,
    audioh,
    audiol,
  ]);
  
  //var digdata = new Float32Array([0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1]);
  var digdata = new Float32Array([1,0,1,1,0,0,1,1,0,1,1,1,0,0,1,0]);
  var diginterp = 40;
  var digsamples = digdata.length * diginterp;
  var digchfreq = 0.30;
  
  // firdes.root_raised_cosine(gain=40.0, sampling_freq=40, symbol_rate=1, alpha=0.25, ntaps=200)
  var dig_rrc_taps = [0.06413525342941284, 0.06912656128406525, 0.07376259565353394, 0.07799314707517624, 0.08176935464143753, 0.08504420518875122, 0.08777286857366562, 0.08991317451000214, 0.09142597764730453, 0.09227557480335236, 0.09243007004261017, 0.09186173975467682, 0.09054736793041229, 0.08846860378980637, 0.0856122076511383, 0.08197031915187836, 0.07754074782133102, 0.07232708483934402, 0.06633895635604858, 0.059592101722955704, 0.05210845172405243, 0.043916214257478714, 0.03504985198378563, 0.025550054386258125, 0.015463657677173615, 0.004843507893383503, -0.006251695565879345, -0.01775762066245079, -0.029604556038975716, -0.04171771556138992, -0.054017573595047, -0.06642024964094162, -0.07883792370557785, -0.09117928892374039, -0.10335005819797516, -0.11525343358516693, -0.12679073214530945, -0.13786186277866364, -0.1483660340309143, -0.15820223093032837, -0.16726994514465332, -0.1754697859287262, -0.18270409107208252, -0.18887759745121002, -0.19389811158180237, -0.19767707586288452, -0.20013023912906647, -0.20117828249931335, -0.20074740052223206, -0.19876980781555176, -0.19518440961837769, -0.18993720412254333, -0.18298178911209106, -0.1742798388004303, -0.16380146145820618, -0.1515255719423294, -0.13744015991687775, -0.12154260277748108, -0.10383985191583633, -0.08434852957725525, -0.0630950927734375, -0.0401158332824707, -0.015456845983862877, 0.010826030746102333, 0.03866736963391304, 0.06799235194921494, 0.09871701151132584, 0.13074859976768494, 0.16398584842681885, 0.19831956923007965, 0.2336329221725464, 0.26980212330818176, 0.30669692158699036, 0.34418120980262756, 0.3821137547492981, 0.4203488230705261, 0.45873698592185974, 0.4971257448196411, 0.5353603959083557, 0.573284924030304, 0.6107425689697266, 0.6475769877433777, 0.6836327314376831, 0.7187562584877014, 0.7527968287467957, 0.7856071591377258, 0.8170443177223206, 0.8469705581665039, 0.8752537369728088, 0.9017686247825623, 0.926396906375885, 0.949028730392456, 0.9695621728897095, 0.987904965877533, 1.0039739608764648, 1.017696499824524, 1.02901029586792, 1.037863850593567, 1.0442167520523071, 1.0480402708053589, 1.049316644668579, 1.0480402708053589, 1.0442167520523071, 1.037863850593567, 1.02901029586792, 1.017696499824524, 1.0039739608764648, 0.987904965877533, 0.9695621728897095, 0.949028730392456, 0.926396906375885, 0.9017686247825623, 0.8752537369728088, 0.8469705581665039, 0.8170443177223206, 0.7856071591377258, 0.7527968287467957, 0.7187562584877014, 0.6836327314376831, 0.6475769877433777, 0.6107425689697266, 0.573284924030304, 0.5353603959083557, 0.4971257448196411, 0.45873698592185974, 0.4203488230705261, 0.3821137547492981, 0.34418120980262756, 0.30669692158699036, 0.26980212330818176, 0.2336329221725464, 0.19831956923007965, 0.16398584842681885, 0.13074859976768494, 0.09871701151132584, 0.06799235194921494, 0.03866736963391304, 0.010826030746102333, -0.015456845983862877, -0.0401158332824707, -0.0630950927734375, -0.08434852957725525, -0.10383985191583633, -0.12154260277748108, -0.13744015991687775, -0.1515255719423294, -0.16380146145820618, -0.1742798388004303, -0.18298178911209106, -0.18993720412254333, -0.19518440961837769, -0.19876980781555176, -0.20074740052223206, -0.20117828249931335, -0.20013023912906647, -0.19767707586288452, -0.19389811158180237, -0.18887759745121002, -0.18270409107208252, -0.1754697859287262, -0.16726994514465332, -0.15820223093032837, -0.1483660340309143, -0.13786186277866364, -0.12679073214530945, -0.11525343358516693, -0.10335005819797516, -0.09117928892374039, -0.07883792370557785, -0.06642024964094162, -0.054017573595047, -0.04171771556138992, -0.029604556038975716, -0.01775762066245079, -0.006251695565879345, 0.004843507893383503, 0.015463657677173615, 0.025550054386258125, 0.03504985198378563, 0.043916214257478714, 0.05210845172405243, 0.059592101722955704, 0.06633895635604858, 0.07232708483934402, 0.07754074782133102, 0.08197031915187836, 0.0856122076511383, 0.08846860378980637, 0.09054736793041229, 0.09186173975467682, 0.09243007004261017, 0.09227557480335236, 0.09142597764730453, 0.08991317451000214, 0.08777286857366562, 0.08504420518875122, 0.08176935464143753, 0.07799314707517624, 0.07376259565353394, 0.06912656128406525, 0.06413525342941284];
  function pshap(input) {
    return DSP.blocks.FIRFilter(DSP.blocks.ImpulseInterpolator(input, diginterp), 2, -Math.floor(dig_rrc_taps.length / 2) - 10 /* fudge factor */, dig_rrc_taps);
  }
  
  var digin = DSP.blocks.ArraySource(digdata);
  var digbaseband = DSP.blocks.ToComplex(digin);
  var dighold = DSP.blocks.RepeatInterpolator(digbaseband, diginterp);
  var digshap = pshap(digbaseband);
  var digshapook = DSP.blocks.Rotator(digshap, digchfreq);
  var digook = DSP.blocks.Rotator(dighold, digchfreq);
  var digpn = DSP.blocks.Mapper(digin, [-1, 1]);
  var digpnbase = DSP.blocks.ToComplex(digpn);
  var digpnhold = DSP.blocks.RepeatInterpolator(digpnbase, diginterp);
  var digpnshap = pshap(digpnbase);
  var digpnkey = DSP.blocks.Rotator(digpnshap, digchfreq);
  var digqpskbase = DSP.blocks.SymbolModulator(digin, 1/Math.sqrt(2), [[-1, -1], [-1, 1], [1, 1], [1, -1]]);
  
  var diggraph = DSP.Graph([
    dighold,
    digook,
    digshap,
    digshapook,
    digpnhold,
    digpnshap,
    digpnkey,
    digpnbase,
    digqpskbase
  ]);
  diggraph();
  
  var twosig1 = DSP.blocks.Siggen(sampleCount, function() { return 0.3; });
  var twosig2 = DSP.blocks.Siggen(sampleCount, function() { return 10; });
  var twosig = DSP.blocks.Add(twosig1, twosig2);
  var twosigl = DSP.blocks.FIRFilter(twosig, 2, -1, [filterOuterCoeff, filterInnerCoeff, filterOuterCoeff]);  // 2 for complex
  var twosigh = DSP.blocks.FIRFilter(twosig, 2, -1, [-filterOuterCoeff, filterInnerCoeff, -filterOuterCoeff]);  // 2 for complex
  DSP.Graph([
    twosig,
    twosigl,
    twosigh,
  ])();
  
  var mbdirector, demodStep = 6;
  ThreeBox.preload(['deps/MathBox.glsl.html'], goMathbox);
  function goMathbox() {
    var element = document.getElementById('mb');
    var mathbox = mathBox(element, {
      stats: false,  // (disable) FPS meter in upper left corner
      cameraControls: true,
      controlClass: ThreeBox.OrbitControls,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000),
      scale: 1
    }).start();
    
    var timeRangeScale = 6;
    
    var vs = 0.4;
    var almost_zero_theta = 0.05;
    mathbox.viewport({
      type: 'cartesian',
      range: [[-2, 2], [-2, 2], [-timeRangeScale, timeRangeScale]],
      scale: [-1*vs, 1*vs, timeRangeScale*vs]
    });
    mathbox.camera({
      orbit: 6,
      phi: PI,
      theta: almost_zero_theta
    });
    mathbox.transition(500);
    
    function axisi(v) { return v == 2 ? 'I' : ''; }
    function axisq(v) { return v == 2 ? 'Q' : ''; }
    var iaxisdef = {
      id: 'iaxis',
      axis: 1,
      color: 0x777777,
      ticks: 3,
      lineWidth: 2,
      size: .05,
      arrow: false,
      labels: false,
      formatter: axisi
    };
    var qaxisdef = {
      id: 'qaxis',
      axis: 0,
      color: 0x777777,
      ticks: 3,
      lineWidth: 2,
      size: .05,
      arrow: false,
      labels: false,
      formatter: axisq
    };
    mathbox.axis(iaxisdef);
    mathbox.axis(qaxisdef);
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
    function docurve(id, color, block1, block2) {
      var array1 = block1.output;
      var array2 = block2 ? block2.output : undefined;
      var outbuf = [0, 0, 0];
      return {
        id: id,
        color: color,
        n: array1.length / 2,
        live: true,
        domain: [-timeRangeScale, timeRangeScale],
        expression: function (x, i) {
          var k = this.get('ksiginterp');
          if (k > 0) {
            outbuf[0] = array1[i * 2 + 1] * (1-k) + array2[i * 2 + 1] * k
            outbuf[1] = array1[i * 2] * (1-k) + array2[i * 2] * k
            outbuf[2] = x;
          } else {
            outbuf[0] = array1[i * 2 + 1]
            outbuf[1] = array1[i * 2]
            outbuf[2] = x;
          }
          return outbuf;
        },
        lineWidth: 2,
        ksiginterp: 0,
      }
    }
    function dopoints(id, color, block) {
      var record = docurve(id, color, block);
      record.points = true;
      record.line = false;
      record.pointSize = 8;
      return record;
    }
    function dountwist(id, color, radiansPerSample, block) {
      var array = block.output;
      var outbuf = [0, 0, 0];
      return {
        id: id,
        color: color,
        n: array.length / 2,
        live: true,
        domain: [-timeRangeScale, timeRangeScale],
        expression: function (x, i) {
          var vi = array[i * 2];
          var vq = array[i * 2 + 1];
          var phase = this.get('kphase') + i * this.get('kfreq');
          var s = sin(phase);
          var c = cos(phase);
          var scale = 1;
          outbuf[0] = scale * (s * vi + c * vq);
          outbuf[1] = scale * (c * vi - s * vq);
          outbuf[2] = x;
          return outbuf;
        },
        lineWidth: 2,
        kfreq: radiansPerSample,
        kphase: 0,
      }
    }
    function dountwistsum(id, radiansPerSample, block) {
      var array = block.output;
      var zero = [0, 0, 0];
      var outbuf = [0, 0, 0];
      return {
        id: id,
        color: 0xFF0000,
        n: 2,
        live: true,
        domain: [-timeRangeScale, timeRangeScale],
        expression: function (x, i) {
          if (i == 0) {
            return zero;
          }
          var zerophase = this.get('kphase');
          var freq = this.get('kfreq');
          var sumi = 0;
          var sumq = 0;
          var limit = array.length / 2;
          for (var i = 0; i < limit; i++) {
            var vi = array[i * 2];
            var vq = array[i * 2 + 1];
            var phase = zerophase + i * freq;
            var s = sin(phase);
            var c = cos(phase);
            sumq += (s * vi + c * vq);
            sumi += (c * vi - s * vq);
          }
          var scale = 40 / limit;
          outbuf[0] = scale * sumq;
          outbuf[1] = scale * sumi;
          outbuf[2] = 0;
          return outbuf;
        },
        lineWidth: 2,
        kfreq: radiansPerSample,
        kphase: 0,
      }
    }

    var counthalf = 10;
    var freqscale = Math.PI / counthalf * 0.1;
    function forfourier(f) {
      var out = [];
      for (var i = -counthalf; i <= counthalf; i++) {
        out.push(f(i, 'fourier' + i));
      }
      return out;
    }
    
    mathbox.curve(docurve('audio', 0x0000FF, dsbbuf));
    
    var step0 = [
      'A Visual Introduction to DSP for SDR',
      'This presentation is intended to give a tour of DSP topics relevant to implementation of software-defined radios. This is not a complete introduction; if you want to do these things yourself you\'ll probably want a book, or somebody else\'s tutorial. The topics I have selected are those which are either particularly fundamental, or which would benefit from the style of animated graphics used here.'
    ];
    var script = [
      [
        'Amplitude modulation (AM)',
        'This is a depiction of amplitude modulation as usually understood — you\'ve probably seen this sort of picture before. The modulating audio signal, in black, is offset above zero and then used to control the amplitude of the carrier signal — that is, they are multiplied — and the result is the signal shown in blue.',
        ['remove', '#audio'],
        ['add', 'curve', docurve('modulatingam', 0x000000, modulatingam)],
        ['add', 'curve', docurve('amout', 0x0077FF, amout)],
      ],
      [
        'Amplitude modulation (AM)',
        'The problem with this picture, for our purposes, is that the math is messy. For example, if you were trying to demodulate this, every time the signal crosses zero, you have no data because the audio was multiplied by zero. Of course, in reality the carrier frequency is immensely higher than the audio frequency, so it\'s easy to average over that. It\'s not that it\'s infeasible to work this way — you can, in exact analogy to analog RF electronics, but rather that there\'s something else you can do which is much more elegant all around. It doesn\'t matter as much for AM, but I\'m using AM in this picture because it makes good pictures, not because it\'s a good example.',
      ],
      [
        'Complex-valued signals',
        'Here we have a signal which has values which are complex numbers rather than real numbers. The carrier wave is a complex sinusoid — the real part is a sine and the imaginary part is a cosine. On this plot the real and imaginary parts are labeled I and Q — these are the conventional names in signal processing, which stand for "in-phase" and "quadrature". This can also be called an analytic signal, which means roughly that it has this helical structure as opposed to being, say, the real signal we usually think of but rotated into the complex plane. The modulation works exactly the same way as you\'ve already seen — multiplying the complex carrier by the real audio varies the magnitude of the signal. (We will see later how this picture corresponds to physical radio signals.) ',
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
        'Frequency modulation (FM)',
        'This is what frequency modulation, FM, looks like in the same setting. The blue curve looks like the conventional picture of frequency modulation; you can see the cycles being closer together and farther apart here. The black line is again the signal without the carrier wave, but this time instead of moving radially, varying amplitude, it is moving around the circle — varying the frequency, the speed of rotation. When it\'s moving in the same direction as the carrier, the frequency is higher, and when it\'s moving in the opposite direction, the frequency is lower.',
        ['remove', '#amout, #modulatingam'],
        ['add', 'curve', docurve('modulatingfm', 0x000000, modulatingfm)],
        ['add', 'curve', docurve('product', 0x0077FF, product)],
      ],
      [
        'Frequency shifting',
        'If we want to receive and demodulate this signal, we\'d like to get rid of that high-frequency carrier wave. In a real radio rather than this picture built for readability, the carrier frequency is immensely higher than the bandwidth of the actual signal, and we\'d like to not deal with the processing requirements of that high frequency — and also to be able to tune anywhere on the radio spectrum and treat the signals the same way.',
        ['remove', '#modulatingfm']
      ],
      [
        'Frequency shifting',
        'We do this by multiplying the signal by another complex sinusoid, shown in red, of equal and opposite frequency. This is a negative frequency — the helix is wound the other way. You can also call it the complex conjugate of the carrier, the number with the imaginary component negated. This cancels out the original carrier wave. In general, this technique allows you to change the frequency of an arbitrary signal, adding or subtracting an offset. When the signal is moved to be centered at zero — zero hertz — it is known as a _baseband_ signal.',
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
          expression: (function() { 
            var frame = 0, phase = 0;
            var zero = [0, 0, 0];
            var outbuf = [0, 0, 0];
            return function (x, n) {
              if (n == 0) {
                return zero;
              } else {
                frame++;
                var t = frame / 2000;
                var rate = 0.5 * (1 + sin(PI * (t % 1 - 0.5))) + Math.floor(t);
                phase += (rate * 1.016) * TWOPI;
                outbuf[0] = sin(phase) * 3;
                outbuf[1] = cos(phase) * 3;
                return outbuf;
              }
            };
          })(),
          lineWidth: 2,
        }]
      ],
      [
        'Sampling and the Nyquist frequency',
        'Frequencies in digital signal processing are points on a circle — they are modulo the sampling frequency. We usually think of them as having a range of plus or minus the Nyquist frequency, because the symmetry is useful. But since nothing in the math and physics respects that limit, we have to do it ourselves, by _filtering_. In a software-defined receiver, we filter using analog circuits to remove frequencies above the Nyquist frequency before sampling the signal. This removes the ambiguity and allows us to treat the frequencies in our digital signal as if they were not circular.',
      ],
      [
        'Digital filtering',
        'Filtering is also useful for sampled digital signals, to allow us to reduce or increase the sample rate, or to separate a particular signal from nearby irrelevant signals and noise. Digital filters can be much more precise than analog filters, and they can be adjusted by changing data rather than changing circuits. To illustrate filtering, here is an example signal which is the combination — the sum — of two components of different frequencies. It looks very far from the nice helixes we\'ve seen so far, but you can easily see the two components. Practically, good digital filters can extract signals that you just can\'t see at all from a plot like this.',
        ['remove', '#clockface'],
        ['animate', 'camera', {
          phi: Math.PI,
          theta: almost_zero_theta
        }, {
          delay: 500,
          duration: 1000
        }],
        ['add', 'curve', docurve('twosig', 0x000000, twosig, twosigl)],
      ],
      [
        'Finite impulse response (FIR) filters',
        'A simple and widely useful class of digital filters is finite impulse response filters. FIR filters operate by taking delayed copies of the input signal, scaling them, and adding them together — a sort of carefully designed moving average.',
      ],
      [
        'Finite impulse response (FIR) filters',
        'In this picture, the copies have amplitudes of one-third, two-thirds, and one-third.',
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
        'When those three are added together, the result contains mostly the low-frequency component of the input signal and not the high-frequency component. This kind of filter is called a low-pass filter. It\'s not a very good one — good filters have systematically chosen coefficients for the scaling, and have many more of them. These coefficients are also called taps, they are the same as the impulse response of the filter, and the count of them is called the filter\'s order.',
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
        'Infinite impulse response (IIR) filters',
        'A so-called infinite impulse response filter works exactly the same way as a finite impulse response filter, except that in addition to summing input samples, it has feedback from its own previous outputs. IIR filters can be more efficient than FIR filters by having a lower order (fewer taps) but have additional hazards such as instability — runaway feedback. As a side note, you may well have used an IIR filter yourself — if you\'ve ever implemented an average like input times 0.1 plus previous output times 0.9, then that\'s an IIR filter of order one.',
      ],
      //['TODO: Discuss filtering for sample rate conversion', ''],
      [
        'Live Filter',
        'Here\'s some filters applied to the live audio; high-pass in green, low-pass in red.',
        ['remove', '#twosign'],
        ['remove', '#twosigp'],
        ['remove', '#twosigh'],
        ['add', 'curve', docurve('audio', 0x0000FF, dsbbuf)],
        ['add', 'curve', docurve('audioh', 0x00DD00, audioh)],
        ['add', 'curve', docurve('audiol', 0xFF0000, audiol)],
      ],
      [
        'The discrete Fourier transform',
        'The discrete Fourier transform, commonly referred to as the fast Fourier transform (which is actually the name of an algorithm for computing it), converts a signal in the form of an array of samples over time — which is what we\'ve been working with so far — into an array of samples over _frequency_. This enables visualization and analysis of an unknown signal, and can also be used to implement filters.',
        ['remove', '#audioh'],
        ['remove', '#audiol'],
        ['animate', 'camera', {
          phi: Math.PI * 1.0,
          theta: almost_zero_theta
        }, {
          delay: 0,
          duration: 1000
        }],
      ],
      (function () {
        return [
          'The discrete Fourier transform',
          'First, let\'s have a large number of copies of the input signal. In reality, we would have a number equal to the length of the input array, but for this illustration ' + (counthalf * 2 + 1) + ' will do.',
          ['remove', '#iaxis'],
          ['remove', '#qaxis'],
          ['remove', '#audio'],
          ['animate', 'camera', {
            phi: Math.PI * 0.7,
            theta: 0.2
          }, {
            delay: 0,
            duration: 2000
          }]
        ].concat(forfourier(function (i, id) {
          return ['add', 'curve', dountwist(id, 0x0000FF, 0, dsbbuf)];
        })).concat(forfourier(function (i, id) {
          return ['add', 'axis', {
            id: id + 'axis',
            axis: 2,
            color: 0x777777,
            ticks: 3,
            lineWidth: 2,
            size: .05,
            arrow: true,
          }];
        })).concat(forfourier(function (i, id) {
          return ['animate', '#' + id, {
            mathPosition: [i, 0, 0]
          }, {
            delay: 3000,
            duration: 3000,
          }];
        })).concat(forfourier(function (i, id) {
          return ['animate', '#' + id + 'axis', {
            mathPosition: [i, 0, 0]
          }, {
            delay: 3000,
            duration: 3000,
          }];
        }));
      }()),
      (function () {
        return [
          'The discrete Fourier transform',
          'Then we multiply the signals by complex sinusoids with equally spaced frequencies. The copy remaining at the center has frequency zero, so it is unchanged. As we saw earlier, the effect of this is that a signal with the equal and opposite frequency will be “untwisted”, becoming a signal with constant phase — that is, it does not rotate around the axis.',
        ].concat(forfourier(function (i, id) {
          return ['animate', '#' + id, {
            kfreq: i * freqscale
          }, {
            delay: 0,
            duration: 7000,
          }];
        }));
      }()),
      (function () {
        return [
          'The discrete Fourier transform',
          'Now if we look at these signals end-on, discarding the time information, we can see which ones are least twisted. These are the closest matches to the frequency components in the original signal!',
          ['animate', 'camera', {
            phi: Math.PI * 0.5,
            theta: 0.0
          }, {
            delay: 0,
            duration: 2000
          }]
        ];
      }()),
      (function () {
        return [
          'The discrete Fourier transform',
          'The final step is to sum these signals over time. Where the frequency doesn\'t match, the samples cancel each other out, so the output values are close to zero. Where the frequency does match, the samples combine and produce a large output value. At this point we have a complete DFT. If we took the red lines above, oriented them in the same direction (discarding the phase), and made the lengths logarithmic, you would then have a spectrogram, exactly as a spectrum analyzer or SDR receiver application displays.',
        ].concat(forfourier(function (i, id) {
          return ['add', 'curve', dountwistsum(id + 'sum', i * freqscale, dsbbuf)];
        })).concat(forfourier(function (i, id) {
          return ['set', '#' + id + 'sum', {
            mathPosition: [i, 0, 0]
          }];
        }));
      }()),
      (function () {
        return [
          'The fast Fourier transform (FFT)',
          'The fast Fourier transform is an algorithm for implementing the DFT efficiently — the naïve implementation I have described here is quadratic in the length of the input. ',
        ].concat(forfourier(function (i, id) {
          return ['add', 'curve', dountwistsum(id + 'sum', i * freqscale, dsbbuf)];
        })).concat(forfourier(function (i, id) {
          return ['set', '#' + id + 'sum', {
            mathPosition: [i, 0, 0]
          }];
        }));
      }()),
      [
        'Real signals',
        'This graphic also shows the relationship of complex-valued signals to real signals. The spectrum of a real signal, which this is, is always symmetric about zero. In other words, a real signal cannot distinguish negative frequencies from positive frequencies, where a complex signal can. A real sinusoid is equivalent to the sum of two complex sinusoids of opposite frequency — the imaginary components cancel out leaving the real component.'
      ],
      [
        'Real signals',
        'That\'s all I have to say about the Fourier transform.'
      ],
      (function () {
        return [
          'Digital modulation',
          'Up to this point, I\'ve been talking about digital signal processing — that is, signal processing as performed by a digital computer. Now, I\'m going to talk about digital _modulation_ — that is, signals which carry digital data. Here we see a digital signal as you might have it in an introduction to digital logic — two levels, representing binary digits one and zero, and sharp transitions between the two, this whole signal being 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0.',
          ['animate', 'camera', {
            phi: PI,
            theta: almost_zero_theta
          }, {
            delay: 0,
            duration: 1000
          }],
          ['add', 'axis', Object.create(iaxisdef, {labels:{value:true}})],
          ['add', 'axis', Object.create(qaxisdef, {labels:{value:true}})],
          ['add', 'curve', docurve('dighold', 0x000000, dighold), {
            delay: 700,
          }],
          //['set', '#dighold', {
          //  points: true,
          //  line: false,
          //}]
        ].concat(forfourier(function (i, id) {
          return ['remove', '#' + id + 'sum'];
        })).concat(forfourier(function (i, id) {
          return ['remove', '#' + id];
        })).concat(forfourier(function (i, id) {
          return ['remove', '#' + id + 'axis'];
        }));
      }()),
      [
        'On-off keying',
        'Here\'s the simplest digital modulation, known as on-off keying. For amateur radio operators, this is the CW mode, though the bit sequence here is not Morse code. This is actually identical to the amplitude modulation I showed you at the beginning, except that instead of the modulating signal being audio, centered about +1, it\'s data and it takes on only the values one and zero. This is a very simple modulation to transmit, and very power-efficient, because you just switch your transmitter on and off. However, note that because of the sharp transitions in amplitude, this signal as shown has a very wide bandwidth at those transitions (in amateur radio terms, “key clicks”).',
        // TODO write non-hams version of this slide
        ['add', 'curve', docurve('digook', 0x0077FF, digook)],
      ],
      [
        'On-off keying with pulse shaping',
        'In order to fix the transitions, we use a pulse shaping filter on the modulating signal. This looks like a mess, and in fact if someone\'s CW transmitter had a keying waveform like this it would be horrible because it lacks crisp transitions, but it does minimize the bandwidth used, and it\'s actually easy for demodulators to handle, as we will see later. Incidentally, the little notches you can see in the signal are imperfections in the filter. We use a truncated filter, one with fewer taps, to save computation at the price of not being quite ideal; the ideal filter would be infinitely long and therefore imposible to implement.',
        // TODO write non-hams version of this slide
        ['remove', '#digook'],
        ['set', '#dighold', {color: 0xAAAAAA}],
        ['add', 'curve', docurve('digshap', 0x000000, digshap)],
        ['add', 'curve', docurve('digshapook', 0x0077FF, digshapook)],
      ],
      [
        'On-off keying with pulse shaping',
        'Now let\'s look at another type of modulation.',
      ],
      [
        'Phase-shift keying',
        'Here we\'ve taken the modulating signal and replaced the zeroes with minus ones. That is, we\'re multiplying the carrier wave by minus one. This has the effect of producing a _phase shift_ by 180 degrees, while leaving the amplitude the same. However, we\'ve introduced an ambiguity — when the receiver starts receiving the signal, it doesn\'t have any reference phase, and so a phase transition could be from zero to one or one to zero. This isn\'t a serious problem, because more synchronization information is needed to make sense of the bits anyway — a known sequence at the beginning of the transmission packet can resolve the ambiguity. Or you can use a differential encoding, where a phase transition stands for one and no transition stands for zero, or vice versa.',
        ['remove', '#dighold'],
        ['remove', '#digshap'],
        ['remove', '#digshapook'],
        ['add', 'curve', docurve('digpnhold', 0xAAAAAA, digpnhold)],
        ['add', 'curve', docurve('digpnshap', 0x000000, digpnshap)],
        ['add', 'curve', dountwist('digpnkey', 0x0077FF, 0, digpnkey)],
      ],
      [
        'Digital demodulation',
        'Before I discuss more complex modulations, let\'s look at what it takes to demodulate this signal, if nothing else so this fairly messy picture gets cleaner. What we have in this case is a carrier wave occasional phase shifts; we need to recover the original bits.',
        ['remove', '#digpnhold'],
        ['remove', '#digpnshap'],
        ['animate', 'camera', {
          phi: Math.PI * 0.8,
          theta: 0.05
        }, {
          delay: 500,
          duration: 1000
        }]
      ],
      [
        'Digital demodulation',
        'First, as previously discussed, we perform a frequency shift to return the signal to baseband. However, because no two independently running oscillators are going to be at exactly the same frequency, this won\'t give perfect results; we need to perform a final correction.',
        ['animate', '#digpnkey', {
          kfreq: -digchfreq * 1.02,
          kphase: 0.4  // arbitrary
        }, {
          delay: 0,
          duration: 7000,
        }]
      ],
      [
        'Digital demodulation',
        'There are a number of algorithms which can be used for this purpose depending on the particular modulation in use. In any case we now have a true baseband signal with no twist to it. The next problem is that we need to recover the bits — to slice this signal up along the time axis.',
        ['animate', '#digpnkey', {
          kfreq: -digchfreq,
        }, {
          delay: 0,
          duration: 1000,
        }],
        ['animate', '#digpnkey', {
          kphase: 0,
        }, {
          delay: 1000,
          duration: 400,
        }]
      ],
      [
        'Digital demodulation',
        'Remember, this is a digital signal, so we already have it sliced up in a sense, but we have far too many samples, and also the sample intervals are not synchronized with the digital clock which generated the bits in the first place at the transmitter; this synchronization is necessary to ensure we don\'t take samples halfway between two bits and read nonsense. Again, there are algorithms for this purpose, and I\'m not going to go into the details of that.',
        ['set', '#digpnkey', {
          points: true,
          line: false,
        }]
      ],
      [
        'Digital demodulation',
        'So, here we have the original bits — still represented as plus and minus one. I\'ve also conveniently assumed we\'ve recovered the exact original phase so they\'re lined up on the I axis.',
        ['remove', '#digpnkey'],
        ['add', 'curve', dopoints('digpnbase', 0x000000, digpnbase)],
      ],
      [
        'Digital demodulation',
        'Now let\'s take the end-on view. Here, we stop being able to see the actual data, and we instead see just all the _possible_ positions in the signal. This is known as a constellation diagram, and it is a very useful representation of digital signals.',
        ['animate', 'camera', {
          phi: Math.PI / 2,
          theta: 0.00
        }, {
          delay: 1000,
          duration: 2000
        }],
      ],
      [
        'Symbols',
        'Notice that there\'s lots of empty space in this diagram — we\'re only using one dimension, but there are two available. Let\'s do that.',
      ],
      [
        'Quadrature phase-shift keying (QPSK)',
        'Now there are four dots rather than two; the digital signal must have four possible values instead of two. Since there are more than two, each dot represents more than a single bit; we call these _symbols_. It takes two bits to identify one of four things, so there are two bits per symbol. Angles on this diagram are phase, so there is 90 degrees of phase separation between them. This case with four symbols is called quadrature phase-shift keying, or QPSK.',
        ['remove', '#digpnbase'],
        ['add', 'curve', dopoints('digqpskbase', 0x000000, digqpskbase)],
      ],
      [
        'Quadrature phase-shift keying (QPSK)',
        'In general, you can have PSK with any number of symbols, but as the number of symbols increases the decreasing separation means that a better signal-to-noise ratio is required to receive the symbols without error. If there were noise in this signal, then you would see it on the diagram as these single points becoming fuzzy clouds of samples; a decoding error occurs when the noise pushes one of the samples into being closer to a different symbol than the correct symbol.',
        ['remove', '#digpnbase'],
        ['add', 'curve', dopoints('digqpskbase', 0x000000, digqpskbase)],
      ],
      // TODO: QAM
      // TODO: FSK
      [
        'Digital modulations: wrap',
        'There\'s lots more that can be said about digital modulations, but that\'s all I have for the moment. One thing I notably haven\'t covered is frequency-shift keying (FSK) modulation, which is very common in amateur applications by way of RTTY and APRS. I\'ll write more on the subject later, but for transmitting, FSK is basically FM with discrete levels rather than an audio signal.',
        // TODO: non-ham version of this slide
        ['remove', '#digpnbase'],
        ['add', 'curve', dopoints('digqpskbase', 0x000000, digqpskbase)],
      ],
      [
        'End',
        'This presentation copyright © 2014, 2015 Kevin Reid. Implemented using the MathBox.js framework. http://switchb.org/kpreid/',
        //['animate', 'camera', {
        //  theta: Math.PI * 0.1
        //}, {
        //  delay: 0,
        //  duration: 2000
        //}],
      ],
    ];
    var mbscript = script.map(function(step) { return step.slice(2); });
    mbdirector = new MathBox.Director(mathbox, mbscript);
    
    var baseTitle = document.title;
    document.body.addEventListener('keydown', function (event) {
      if (event.keyCode == 39) {
        mbdirector.forward();
      } else if (event.keyCode == 37) {
        mbdirector.back();
      } else {
        return;
      }
      writeFragment();
      g();
      //console.log('Now at slide', mbdirector.step);
    }, false);
    //setTimeout(function() {
    //  mbdirector.forward();
    //}, 1000);
    //mbdirector.go(script.length - 1);
    
    function readFragment() {
      var fragment = window.location.hash;
      if (fragment[0] !== "#") return;
      mbdirector.go(parseInt(fragment.substr(1)));
      writeFragment();
    }
    function writeFragment() {
      document.title = '(' + mbdirector.step + ') ' + baseTitle;
      window.history.replaceState(undefined, document.title, '#' + mbdirector.step);
    }
    window.addEventListener("popstate", function (event) {
      readFragment();
    });
    readFragment();
    
    setInterval(function() {
      var step = mbdirector.step;
      document.getElementById('slidetitle').textContent = (step ? script[step - 1] : step0)[0];
      document.getElementById('slidecaption').textContent = (step ? script[step - 1] : step0)[1];
    }, 20);
  }
  
  var paused = false;
  var leveltrigger = false;
  document.body.addEventListener('keydown', function (event) {
    if (event.keyCode == 0x20) {
      paused = !paused;
    }
    if (event.keyCode == 'T'.charCodeAt(0)) {
      leveltrigger = true;
      paused = false;
      console.log('leveltrigger');
    }
  }, false);
  
  var audioTriggerArray = new Float32Array(fftnode.fftSize);
  function updateFFT() {
    if (!paused) {
    
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
    
    }
    
    if (!paused || (mbdirector && mbdirector.step == demodStep)) {
      g();
    }

    if (leveltrigger) {
      for (var i = audioarray.length - 1; i >= 0; i--) {
        if (audioarray[i] > 0.5) {
          leveltrigger = false;
          paused = true;
          console.log('triggered');
          break;
        }
      }
    }
  }
  
  function loop() {
    updateFFT();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();