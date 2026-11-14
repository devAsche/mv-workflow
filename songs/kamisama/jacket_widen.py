import cv2, numpy as np
J = cv2.imread('/mnt/user-data/uploads/MV制作/神様のコレクション/52C81806-D355-488A-87E3-074B36B1A818.jpg').astype(np.float32)
K = cv2.imread('/mnt/user-data/uploads/AI model/autopilot/outbox/files/20261115-0200-kami-k5a/kami_k5a_00001_.png').astype(np.float32)
H, W = K.shape[:2]
M = np.array([[1.48482041, 0.00079069, 673.906], [-0.00079069, 1.48482041, 6.22]])
Jw = cv2.warpAffine(J, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
mask = cv2.warpAffine(np.ones(J.shape[:2], np.float32), M, (W, H), flags=cv2.INTER_LINEAR)
# trim and feather the inside edges
m = (mask > 0.99).astype(np.float32)
m = cv2.erode(m, np.ones((5, 5)), iterations=6)
m = cv2.GaussianBlur(m, (0, 0), 70)
m = np.clip((m - 0.0) * 1.0, 0, 1)
# vertical: keep the jacket to the top and bottom edges (it covers them); feather only left/right
cols = np.where(mask[H // 2] > 0.99)[0]; x0, x1 = cols[0], cols[-1]
xs = np.arange(W, dtype=np.float32)
f = 160.0
hm = np.clip(np.minimum((xs - x0 - 10) / f, (x1 - 10 - xs) / f), 0, 1)
hm = hm * hm * (3 - 2 * hm)
A = np.repeat(hm[None, :], H, 0)[..., None]
# match K's colour statistics to the jacket where both exist (a band inside the seams)
band = (A[..., 0] > 0.3) & (A[..., 0] < 0.95)
for c in range(3):
    km, ks = K[..., c][band].mean(), K[..., c][band].std()
    jm, js = Jw[..., c][band].mean(), Jw[..., c][band].std()
    K[..., c] = (K[..., c] - km) * (js / ks) + jm
out = Jw * A + K * (1 - A)
cv2.imwrite('kami_jacket_wide.png', np.clip(out, 0, 255).astype(np.uint8))
cv2.imwrite('kami_jacket_wide_prev.jpg', cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (1536, 864)), [cv2.IMWRITE_JPEG_QUALITY, 88])
print(x0, x1)
