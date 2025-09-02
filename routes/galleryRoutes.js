// routes/galleryRoutes.js
const express = require('express');
const router = express.Router();
const Gallery = require('../models/Gallery');
// 引入你的图片上传中间件（如 Multer）
const upload = require('../path/to/your/multer/config'); 

// 获取所有共享图库，并按最新创建时间排序
router.get('/shared', async (req, res) => {
    try {
        const sharedGalleries = await Gallery.find({ isShared: true }).sort({ createdAt: -1 });
        res.status(200).json(sharedGalleries);
    } catch (error) {
        res.status(500).json({ message: '获取共享图库失败', error });
    }
});

// 获取我的图库，并按最新创建时间排序
router.get('/my', async (req, res) => {
    try {
        // 你需要一个验证用户身份的中间件来获取 req.user.id
        const myGalleries = await Gallery.find({ owner: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(myGalleries);
    } catch (error) {
        res.status(500).json({ message: '获取我的图库失败', error });
    }
});

// 新建一个图库
router.post('/create', async (req, res) => {
    try {
        const { title, isShared } = req.body;
        const newGallery = new Gallery({
            title,
            isShared,
            owner: req.user.id
        });
        await newGallery.save();
        res.status(201).json(newGallery);
    } catch (error) {
        res.status(500).json({ message: '创建图库失败', error });
    }
});

// 向图库中上传图片
router.post('/:galleryId/upload', upload.single('image'), async (req, res) => {
    try {
        const gallery = await Gallery.findById(req.params.galleryId);
        if (!gallery) {
            return res.status(404).json({ message: '图库未找到' });
        }
        
        const newImage = { url: `/uploads/${req.file.filename}` }; // 使用你的图片URL路径
        gallery.images.push(newImage);
        await gallery.save();
        res.status(200).json(newImage);
    } catch (error) {
        res.status(500).json({ message: '图片上传失败', error });
    }
});

// routes/galleryRoutes.js (继续添加)
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

router.get('/:galleryId/download', async (req, res) => {
    try {
        const gallery = await Gallery.findById(req.params.galleryId);
        if (!gallery) {
            return res.status(404).json({ message: '图库未找到' });
        }

        const archive = archiver('zip', { zlib: { level: 9 } });
        const output = fs.createWriteStream(path.join(__dirname, '..', 'temp', `${gallery.title}.zip`));

        output.on('close', () => {
            res.download(output.path, `${gallery.title}.zip`, (err) => {
                if (err) console.error('下载失败:', err);
                // 下载完成后删除临时文件
                fs.unlinkSync(output.path);
            });
        });

        archive.on('error', (err) => {
            throw err;
        });

        // 将每张图片添加到zip文件中
        gallery.images.forEach(image => {
            const imagePath = path.join(__dirname, '..', 'uploads', path.basename(image.url));
            archive.file(imagePath, { name: path.basename(image.url) });
        });

        archive.pipe(output);
        archive.finalize();

    } catch (error) {
        res.status(500).json({ message: '打包下载失败', error });
    }
});

module.exports = router;