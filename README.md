A Visual Introduction to DSP for SDR
====================================

This is an animated slide deck providing a tour of digital signal processing topics relevant to implementation of software-defined radios, focusing on building visual/geometric intuition for signals.

Topics covered:

* Complex (IQ) and analytic signals.
* Filtering (FIR and IIR).
* Frequency shifting.
* Sampling rates and the Nyquist limit.
* The discrete Fourier transform (DFT) and fast Fourier transform (FFT).

History
-------

I originally wrote down the idea for this presentation as follows:

> sdr tutorial idea:  
> starting from interactive slide deck w/ live spiral-graph display  
> transform it in multiple ways  
> a fft corresponds to successive amounts of untwist + sum (does it?)  
> Use the MathBox WebGL framework

That sat around for a while until <a href="https://twitter.com/spenchdotnet">Balint Seeber</a> organized <a href="http://www.meetup.com/Cyberspectrum/">a meetup group for SDR</a> local to me, in November 2014, and I saw an excuse to do this thing — and here it is, exactly as originally conceived.

[Here's the recording of that meetup with me giving this presentation](https://www.youtube.com/watch?v=DUGr_Z04SKs&t=12m30s).

License
-------

All source code and other materials, excluding the contents of the `deps/` directory which is third-party code used under license, are Copyright © 2014, 2015 Kevin Reid, and licensed as follows (the “MIT License”):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
> 
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
> 
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
