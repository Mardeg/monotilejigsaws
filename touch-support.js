(function () {
  // Touch support for dragging and two-finger swipe rotation.
  // One finger holds the piece (drag), a second finger swipes up/down to rotate.
  const ROTATION_SENSITIVITY = 0.35; // degrees per pixel of second-finger vertical movement
  const MOVE_THRESHOLD = 2; // pixels

  // State for a single active piece interaction
  let primaryTouch = null; // { id, startX, startY, elem, origTx, origTy, origAngle, cx, cy, moved, currentAngle }
  let rotationTouch = null; // { id, startY, startAngle }

  const pieceSelector = 'g[transform^="translate"]';
  let piecesCache = null;

  function refreshPiecesCache() {
    piecesCache = new Set(document.querySelectorAll(pieceSelector));
  }

  // Parse transform attribute to extract translate and rotate info.
  function parseTransform(el) {
    const t = { tx: 0, ty: 0, angle: 0, cx: 0, cy: 0 };
    const tf = (el.getAttribute('transform') || '').trim();

    const trMatch = tf.match(/translate\(\s*([\-\d.+e]+)(?:[ ,]\s*([\-\d.+e]+))?\s*\)/i);
    if (trMatch) {
      t.tx = parseFloat(trMatch[1]) || 0;
      t.ty = parseFloat(trMatch[2]) || 0;
    }

    const rotMatch = tf.match(/rotate\(\s*([\-\d.+e]+)(?:[ ,]\s*([\-\d.+e]+)[ ,]\s*([\-\d.+e]+))?\s*\)/i);
    if (rotMatch) {
      t.angle = parseFloat(rotMatch[1]) || 0;
      if (rotMatch[2] && rotMatch[3]) {
        t.cx = parseFloat(rotMatch[2]);
        t.cy = parseFloat(rotMatch[3]);
      }
    }

    // If center not provided by rotate, try element bbox center
    if ((t.cx === 0 && t.cy === 0) || isNaN(t.cx) || isNaN(t.cy)) {
      try {
        const bb = el.getBBox();
        t.cx = bb.x + bb.width / 2;
        t.cy = bb.y + bb.height / 2;
      } catch (e) {
        t.cx = 0;
        t.cy = 0;
      }
    }

    return t;
  }

  // Write transform preserving translate then rotate order
  function writeTransform(el, tx, ty, angle, cx, cy) {
    const rotPart = typeof angle === 'number' ? ` rotate(${angle} ${cx} ${cy})` : '';
    el.setAttribute('transform', `translate(${tx} ${ty})${rotPart}`);
  }

  function getTouchById(touches, id) {
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === id) return touches[i];
    }
    return null;
  }

  // Determine piece element using the same selector you already use
  function findPieceElement(node) {
    if (!piecesCache) refreshPiecesCache();
    while (node && node !== document) {
      if (piecesCache.has(node)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function onTouchStart(e) {
    if (!e.changedTouches || e.changedTouches.length === 0) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (!target) continue;

      const piece = findPieceElement(target);
      if (!piece) continue;

      // Start primary touch (drag) if none exists
      if (!primaryTouch) {
        const tf = parseTransform(piece);
        primaryTouch = {
          id: t.identifier,
          startX: t.clientX,
          startY: t.clientY,
          elem: piece,
          origTx: tf.tx,
          origTy: tf.ty,
          origAngle: tf.angle,
          cx: tf.cx,
          cy: tf.cy,
          moved: false,
        };
        refreshPiecesCache();
        // Prevent page scroll while interacting
        e.preventDefault();
      } else if (!rotationTouch) {
        // A second finger anywhere starts rotation relative to the primary baseline
        rotationTouch = {
          id: t.identifier,
          startY: t.clientY,
          startAngle: primaryTouch.origAngle,
        };
        e.preventDefault();
      }
    }
  }

  function onTouchMove(e) {
    if (!primaryTouch && !rotationTouch) return;
    e.preventDefault();

    // Drag handling for primary touch
    if (primaryTouch) {
      const t = getTouchById(e.touches, primaryTouch.id);
      if (t) {
        const dx = t.clientX - primaryTouch.startX;
        const dy = t.clientY - primaryTouch.startY;

        if (!primaryTouch.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) {
          // ignore micro-movements
        } else {
          primaryTouch.moved = true;
          const newTx = primaryTouch.origTx + dx;
          const newTy = primaryTouch.origTy + dy;
          const curAngle = primaryTouch.currentAngle !== undefined ? primaryTouch.currentAngle : primaryTouch.origAngle;
          writeTransform(primaryTouch.elem, newTx, newTy, curAngle, primaryTouch.cx, primaryTouch.cy);
        }
      }
    }

    // Rotation handling for rotation touch (works even if rotation touch is not on the piece)
    if (rotationTouch && primaryTouch) {
      const t = getTouchById(e.touches, rotationTouch.id);
      if (t) {
        const dy = t.clientY - rotationTouch.startY;
        // swiping down -> clockwise (increase angle); up -> counterclockwise (decrease)
        const deltaAngle = dy * ROTATION_SENSITIVITY;
        const newAngle = rotationTouch.startAngle + deltaAngle;
        primaryTouch.currentAngle = newAngle;

        // Compute current translate (commit drag if moved)
        let tx = primaryTouch.origTx;
        let ty = primaryTouch.origTy;
        if (primaryTouch.moved) {
          const pt = getTouchById(e.touches, primaryTouch.id);
          if (pt) {
            tx = primaryTouch.origTx + (pt.clientX - primaryTouch.startX);
            ty = primaryTouch.origTy + (pt.clientY - primaryTouch.startY);
          }
        }

        writeTransform(primaryTouch.elem, tx, ty, newAngle, primaryTouch.cx, primaryTouch.cy);
      }
    }
  }

  function onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (primaryTouch && t.identifier === primaryTouch.id) {
        // Commit rotation if any and clear
        if (primaryTouch.currentAngle !== undefined) {
          primaryTouch.origAngle = primaryTouch.currentAngle;
          primaryTouch.currentAngle = undefined;
        }
        primaryTouch = null;
        rotationTouch = null;
      }

      if (rotationTouch && t.identifier === rotationTouch.id) {
        rotationTouch = null;
        if (primaryTouch && primaryTouch.currentAngle !== undefined) {
          primaryTouch.origAngle = primaryTouch.currentAngle;
          primaryTouch.currentAngle = undefined;
        }
      }
    }
  }

  function onTouchCancel(e) {
    onTouchEnd(e);
  }

  // Attach listeners to the SVG root (replace selector if needed)
  const svgRoot = document.querySelector('svg') || document.getElementById('svgroot');
  if (svgRoot) {
    svgRoot.addEventListener('touchstart', onTouchStart, { passive: false });
    svgRoot.addEventListener('touchmove', onTouchMove, { passive: false });
    svgRoot.addEventListener('touchend', onTouchEnd, { passive: false });
    svgRoot.addEventListener('touchcancel', onTouchCancel, { passive: false });
  } else {
    console.warn('Touch support: no SVG root found to attach listeners.');
  }

  // Optional utility for programmatic rotation
  window.__jigsawTouchRotateBy = function (elem, deltaDegrees) {
    const tf = parseTransform(elem);
    const newAngle = tf.angle + deltaDegrees;
    writeTransform(elem, tf.tx, tf.ty, newAngle, tf.cx, tf.cy);
  };
})();
