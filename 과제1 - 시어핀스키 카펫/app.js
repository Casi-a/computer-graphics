let canvas;
let gl;
let points = [];
let numTimesToSubdivide = 0;
let colorLoc;
let currentColor = [1.0, 0.0, 0.0, 1.0];

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl");
    if (!gl) {
        alert("WebGL 사용 불가능");
    }

    // 슬라이더 이벤트 리스너
    document.getElementById("slider").onchange = function(event) {
        numTimesToSubdivide = parseInt(event.target.value);
        render();
    };

    // 컬러 피커 이벤트 리스너 (HEX 코드를 RGB 정규화 배열로 변환)
    document.getElementById("color-picker").onchange = function(event) {
        let hex = event.target.value;
        let r = parseInt(hex.substr(1, 2), 16) / 255.0;
        let g = parseInt(hex.substr(3, 2), 16) / 255.0;
        let b = parseInt(hex.substr(5, 2), 16) / 255.0;
        currentColor = [r, g, b, 1.0];
        render();
    };

    // 셰이더 초기화 및 프로그램 연결
    let program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 버퍼 생성 및 바인딩
    let bufferId = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);

    // 정점 위치 속성 활성화
    let vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    // uniform 변수 위치 가져오기
    colorLoc = gl.getUniformLocation(program, "fColor");

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    render();
};

// 자바스크립트 배열을 Float32Array로 평탄화
function flatten(v) {
    let n = v.length;
    let floats = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        floats[i * 2] = v[i][0];
        floats[i * 2 + 1] = v[i][1];
    }
    return floats;
}

// 사각형을 9등분하여 프랙탈 구조를 생성하는 재귀 함수
function divideSquare(x, y, size, count) {
    if (count === 0) {
        // 사각형 하나를 2개의 삼각형으로 구성
        points.push([x, y]);
        points.push([x + size, y]);
        points.push([x, y - size]);

        points.push([x + size, y]);
        points.push([x + size, y - size]);
        points.push([x, y - size]);
    } else {
        let newSize = size / 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                // 정중앙 위치인 인덱스 [1, 1]은 제외
                if (i === 1 && j === 1) {
                    continue; 
                }
                let newX = x + j * newSize;
                let newY = y - i * newSize;
                divideSquare(newX, newY, newSize, count - 1);
            }
        }
    }
}

// 렌더링 함수
function render() {
    points = [];
    
    // 초기 사각형: 좌측 상단서 시작, 너비와 높이는 2
    divideSquare(-1.0, 1.0, 2.0, numTimesToSubdivide);

    // 정점 데이터를 flatten 함수로 변환하여 GPU 버퍼에 로드
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    
    // 선택된 색상 데이터를 단편 셰이더의 uniform 변수로 전달
    gl.uniform4f(colorLoc, currentColor[0], currentColor[1], currentColor[2], currentColor[3]);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, points.length);
}

// 셰이더 초기화 유틸리티
function initShaders(gl, vertexShaderId, fragmentShaderId) {
    let vertElem = document.getElementById(vertexShaderId);
    let vertShdr = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertShdr, vertElem.text);
    gl.compileShader(vertShdr);

    let fragElem = document.getElementById(fragmentShaderId);
    let fragShdr = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShdr, fragElem.text);
    gl.compileShader(fragShdr);

    let program = gl.createProgram();
    gl.attachShader(program, vertShdr);
    gl.attachShader(program, fragShdr);
    gl.linkProgram(program);

    return program;
}