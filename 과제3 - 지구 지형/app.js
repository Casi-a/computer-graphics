let canvas, gl, program;

const latBands = 64;
const lonBands = 128;

let points = [], normals = [], texCoords = [];
let vBuffer, nBuffer, tBuffer;

let isSpinning = true;
let spinSpeed = 0.5;
let earthAngle = -125.0;
let heightScale = 0.1;

let fullLight = false;
let autoLight = true;
let lightAngle = 0.0;

let camRadius = 3.0, camTheta = 20.0, camPhi = 0.0;
let dragging = false, lastX = 0, lastY = 0;

let modelViewLoc, projectionLoc, normalLoc, lightPosLoc;
let ambientLoc, diffuseLoc, specularLoc;

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { alert("WebGL 사용 불가"); return; }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    vBuffer = gl.createBuffer();
    nBuffer = gl.createBuffer();
    tBuffer = gl.createBuffer();

    makeEarthMesh();
    makeEarthTexture();

    ambientLoc = gl.getUniformLocation(program, "ambientProduct");
    diffuseLoc = gl.getUniformLocation(program, "diffuseProduct");
    specularLoc = gl.getUniformLocation(program, "specularProduct");
    gl.uniform4fv(ambientLoc, flatten(vec4(0.2, 0.2, 0.2, 1.0)));
    gl.uniform4fv(diffuseLoc, flatten(vec4(1.0, 1.0, 1.0, 1.0)));
    gl.uniform4fv(specularLoc, flatten(vec4(0.3, 0.3, 0.3, 1.0)));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), 20.0);

    modelViewLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionLoc = gl.getUniformLocation(program, "projectionMatrix");
    normalLoc = gl.getUniformLocation(program, "normalMatrix");
    lightPosLoc = gl.getUniformLocation(program, "lightPosition");

    // UI 이벤트
    let spinBtn = document.getElementById("btn-spin");
    let autoLightBox = document.getElementById("auto-light");
    let lightAngleSlider = document.getElementById("light-angle");

    spinBtn.onclick = function () {
        isSpinning = !isSpinning;
        spinBtn.textContent = isSpinning ? "자전 정지" : "자전 시작";
    };
    document.getElementById("spin-speed").oninput = function (e) {
        spinSpeed = parseFloat(e.target.value);
    };
    document.getElementById("height-scale").oninput = function (e) {
        heightScale = parseFloat(e.target.value);
        makeEarthMesh();
    };
    document.getElementById("full-light").onchange = function (e) {
        fullLight = e.target.checked;
        autoLightBox.disabled = fullLight;
        lightAngleSlider.disabled = fullLight;

        if (fullLight) {
            gl.uniform4fv(ambientLoc, flatten(vec4(0.9, 0.9, 0.9, 1.0)));
            gl.uniform4fv(diffuseLoc, flatten(vec4(0.2, 0.2, 0.2, 1.0)));
            gl.uniform4fv(specularLoc, flatten(vec4(0.0, 0.0, 0.0, 1.0)));
        } else {
            gl.uniform4fv(ambientLoc, flatten(vec4(0.2, 0.2, 0.2, 1.0)));
            gl.uniform4fv(diffuseLoc, flatten(vec4(1.0, 1.0, 1.0, 1.0)));
            gl.uniform4fv(specularLoc, flatten(vec4(0.3, 0.3, 0.3, 1.0)));
        }
    };
    autoLightBox.onchange = function (e) {
        autoLight = e.target.checked;
    };
    lightAngleSlider.oninput = function (e) {
        lightAngle = parseFloat(e.target.value);
    };

    // 마우스 조작
    canvas.onmousedown = function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    window.onmouseup = function () { dragging = false; };
    window.onmousemove = function (e) {
        if (!dragging) return;
        camPhi -= (e.clientX - lastX) * 0.5;
        camTheta = Math.max(-80, Math.min(80, camTheta + (e.clientY - lastY) * 0.5));
        lastX = e.clientX;
        lastY = e.clientY;
    };
    canvas.onwheel = function (e) {
        e.preventDefault();
        camRadius = Math.max(1.8, Math.min(6.0, camRadius + e.deltaY * 0.002));
    };

    render();
};

// 지구 메쉬 생성
function makeEarthMesh() {
    points = [];
    normals = [];
    texCoords = [];

    let grid = [];
    for (let i = 0; i <= latBands; i++) {
        let row = [];
        let v = i / latBands;
        let lat = (0.5 - v) * Math.PI;
        let dataY = Math.min(Math.floor(v * EARTH_LAT_COUNT), EARTH_LAT_COUNT - 1);

        for (let j = 0; j <= lonBands; j++) {
            let u = j / lonBands;
            let lon = (u - 0.5) * 2.0 * Math.PI;
            let dataX = Math.min(Math.floor(u * EARTH_LON_COUNT), EARTH_LON_COUNT - 1);

            let elev = earthElevation[dataY * EARTH_LON_COUNT + dataX];
            let r = 1.0 + (elev > 0 ? (elev / 7000.0) * heightScale : 0.0);

            row.push(vec3(
                r * Math.cos(lat) * Math.sin(lon),
                r * Math.sin(lat),
                r * Math.cos(lat) * Math.cos(lon)
            ));
        }
        grid.push(row);
    }

    // 법선 계산
    let nGrid = [];
    for (let i = 0; i <= latBands; i++) {
        let row = [];
        for (let j = 0; j <= lonBands; j++) {
            if (i === 0 || i === latBands) {
                row.push(normalize(grid[i][j]));
            } else {
                let jl = Math.max(0, j - 1);
                let jr = Math.min(lonBands, j + 1);
                let n = normalize(cross(
                    subtract(grid[i][jr], grid[i][jl]),
                    subtract(grid[i - 1][j], grid[i + 1][j])
                ));
                row.push(n);
            }
        }
        nGrid.push(row);
    }

    // 삼각형 구성
    for (let i = 0; i < latBands; i++) {
        let v1 = i / latBands, v2 = (i + 1) / latBands;
        for (let j = 0; j < lonBands; j++) {
            let u1 = j / lonBands, u2 = (j + 1) / lonBands;

            points.push(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1]);
            normals.push(nGrid[i][j], nGrid[i + 1][j], nGrid[i + 1][j + 1]);
            texCoords.push(vec2(u1, v1), vec2(u1, v2), vec2(u2, v2));

            points.push(grid[i][j], grid[i + 1][j + 1], grid[i][j + 1]);
            normals.push(nGrid[i][j], nGrid[i + 1][j + 1], nGrid[i][j + 1]);
            texCoords.push(vec2(u1, v1), vec2(u2, v2), vec2(u2, v1));
        }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    let vPos = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPos);

    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);
    let vNor = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNor);

    gl.bindBuffer(gl.ARRAY_BUFFER, tBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(texCoords), gl.STATIC_DRAW);
    let vTex = gl.getAttribLocation(program, "vTexCoord");
    gl.vertexAttribPointer(vTex, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vTex);
}

// 텍스처 로드
function makeEarthTexture() {
    let texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 255, 255])
    );
    gl.uniform1i(gl.getUniformLocation(program, "texture"), 0);

    let img = new Image();
    img.onload = function () {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    img.src = EARTH_TEXTURE_DATA;
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (isSpinning) earthAngle = (earthAngle + spinSpeed) % 360.0;
    if (autoLight && !fullLight) {
        lightAngle = (lightAngle + 0.5) % 360.0;
        document.getElementById("light-angle").value = Math.floor(lightAngle);
    }

    let tr = radians(camTheta), pr = radians(camPhi);
    let eye = vec3(
        camRadius * Math.cos(tr) * Math.sin(pr),
        camRadius * Math.sin(tr),
        camRadius * Math.cos(tr) * Math.cos(pr)
    );

    let viewMatrix = lookAt(eye, vec3(0, 0, 0), vec3(0, 1, 0));
    let modelViewMatrix = mult(viewMatrix, rotateY(earthAngle));
    let projectionMatrix = perspective(45.0, 1.0, 0.1, 20.0);

    let lr = radians(lightAngle);
    let lightPos = fullLight
        ? vec4(0.0, 0.0, 5.0, 1.0)
        : mult(viewMatrix, vec4(5.0 * Math.cos(lr), 2.0, 5.0 * Math.sin(lr), 1.0));

    gl.uniformMatrix4fv(modelViewLoc, false, flatten(modelViewMatrix));
    gl.uniformMatrix4fv(projectionLoc, false, flatten(projectionMatrix));
    gl.uniformMatrix3fv(normalLoc, false, flatten(normalMatrix(modelViewMatrix, true)));
    gl.uniform4fv(lightPosLoc, flatten(lightPos));

    gl.drawArrays(gl.TRIANGLES, 0, points.length);
    window.requestAnimFrame(render);
}
