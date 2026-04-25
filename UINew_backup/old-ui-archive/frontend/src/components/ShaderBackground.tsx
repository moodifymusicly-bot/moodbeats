'use client';

import React, { useEffect, useRef, useCallback } from 'react';

const ShaderBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
      gl_Position = aVertexPosition;
    }
  `;

  const fsSource = `
    precision highp float;
    uniform vec2 iResolution;
    uniform float iTime;

    const float overallSpeed = 0.12;
    const float gridSmoothWidth = 0.015;
    const float minLineWidth = 0.006;
    const float maxLineWidth = 0.09;
    const float lineSpeed = 1.0 * overallSpeed;
    const float lineAmplitude = 2.8;
    const float lineFrequency = 0.32;
    const float warpSpeed = 0.08 * overallSpeed;
    const float warpFrequency = 0.25;
    const float warpAmplitude = 0.35;
    const float offsetFrequency = 0.45;
    const float offsetSpeed = 0.8 * overallSpeed;
    const float minOffsetSpread = 0.5;
    const float maxOffsetSpread = 1.8;
    const float scale = 3.5;
    const int linesPerGroup = 12;

    #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
    #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))

    float waveLine(float t) {
      return (sin(t) + sin(t * 1.8 + 0.8) + sin(t * 0.6 + 1.6) + cos(t * 2.2 + 0.3) + sin(t * 3.1 + 0.4) * 0.3) / 4.3;
    }

    float getWaveY(float x, float horizontalFade, float offset) {
      return waveLine(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
    }

    void main() {
      vec2 fragCoord = gl_FragCoord.xy;
      vec2 uv = fragCoord / iResolution.xy;

      vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

      float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
      float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

      space.y += waveLine(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.35 + horizontalFade * 0.55);
      space.x += waveLine(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade * 0.45;

      vec4 lines = vec4(0.0);

      for (int l = 0; l < linesPerGroup; l++) {
        float normalizedIdx = float(l) / float(linesPerGroup);
        float offsetTime = iTime * offsetSpeed;
        float offsetPosition = float(l) + space.x * offsetFrequency;
        float r = waveLine(offsetPosition + offsetTime) * 0.5 + 0.5;
        float halfWidth = mix(minLineWidth, maxLineWidth, r * horizontalFade) / 2.0;
        float offset = waveLine(offsetPosition + offsetTime * (1.0 + normalizedIdx))
                       * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
        float linePosition = getWaveY(space.x, horizontalFade, offset);

        float smoothPart = drawSmoothLine(linePosition, halfWidth, space.y) / 1.8;
        float crispPart = drawCrispLine(linePosition, halfWidth * 0.15, space.y);
        float glowPart = drawSmoothLine(linePosition, halfWidth * 3.0, space.y) * 0.15;
        float line = smoothPart + crispPart + glowPart;

        float hueShift = normalizedIdx * 3.14159 + iTime * 0.12;
        vec4 lineColor = vec4(
          0.25 + 0.25 * sin(hueShift + 2.0),
          0.35 + 0.30 * sin(hueShift + 0.5),
          0.65 + 0.35 * sin(hueShift),
          1.0
        );

        float glowFactor = 0.65 + 0.35 * (1.0 - normalizedIdx);
        lines += line * lineColor * r * glowFactor;
      }

      vec4 bg = mix(
        vec4(0.025, 0.015, 0.055, 1.0),
        vec4(0.055, 0.018, 0.095, 1.0),
        uv.x + sin(iTime * 0.06) * 0.06
      );
      bg = mix(bg, vec4(0.02, 0.01, 0.04, 1.0), (1.0 - verticalFade) * 0.5);
      bg *= verticalFade * 0.85 + 0.15;

      vec4 finalColor = bg;
      finalColor += lines * 1.1;

      finalColor = 1.0 - exp(-finalColor * 1.6);
      finalColor.a = 1.0;

      gl_FragColor = finalColor;
    }
  `;

  const loadShader = useCallback((gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }, []);

  const initShaderProgram = useCallback((gl: WebGLRenderingContext, vs: string, fs: string) => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vs);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fs);
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }, [loadShader]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) {
      console.warn('WebGL not supported');
      return;
    }

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    if (!shaderProgram) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1,
    ]), gl.STATIC_DRAW);

    const programInfo = {
      program: shaderProgram,
      attribs: {
        position: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      },
      uniforms: {
        resolution: gl.getUniformLocation(shaderProgram, 'iResolution'),
        time: gl.getUniformLocation(shaderProgram, 'iTime'),
      },
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = 0.75;
      canvas.width = Math.round(window.innerWidth * dpr * scale);
      canvas.height = Math.round(window.innerHeight * dpr * scale);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener('resize', resize);
    resize();

    const startTime = performance.now();

    gl.enableVertexAttribArray(programInfo.attribs.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(programInfo.attribs.position, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(programInfo.program);

    const render = (now: number) => {
      const t = (now - startTime) / 1000;
      gl.uniform2f(programInfo.uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(programInfo.uniforms.time, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(shaderProgram);
      gl.deleteBuffer(positionBuffer);
    };
  }, [initShaderProgram]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full"
      style={{ zIndex: -1, imageRendering: 'auto' }}
      aria-hidden="true"
    />
  );
};

export default React.memo(ShaderBackground);
