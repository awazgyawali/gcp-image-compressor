// A function to select a gcp bucket from the list of buckets
// access the folders and traverse through each image
// compress it
// and re upload the same file

const { Storage } = require('@google-cloud/storage');
const sharp = require('sharp');
const path = require('path');
const bucketName = 'gs://aawaz-gyawali.appspot.com'

const storage = new Storage();
const bucket = storage.bucket(bucketName)

// Function to check if a file has an image extension
function isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
}

// Function to get the size of a file in bytes
async function getFileSize(filename) {
    const [metadata] = await storage.bucket(bucketName).file(filename).getMetadata();
    return metadata.size;
}
// Function to compress and upload an image file
function compressAndUploadImage(filename) {
    const sourceFile = storage.bucket(bucketName).file(filename);
    const destFile = storage.bucket(bucketName).file('compressed_' + filename);

    // Read image from GCS, resize and compress it using sharp
    const readStream = sourceFile.createReadStream();
    // Do not rotate
    const resizeStream = sharp().resize(1080)
        .jpeg({ quality: 80, })
        .rotate();
    // Resize to 800px and set JPEG quality to 80%
    const uploadStream = destFile.createWriteStream();

    readStream.pipe(resizeStream).pipe(uploadStream);

    return new Promise((resolve, reject) => {
        uploadStream.on('finish', resolve);
        uploadStream.on('error', reject);
    });
}

async function compressAllImages() {
    // Select a bucket

    let totalSaved = 0;
    const [files] = await bucket.getFiles();

    for (const file of files) {
        if (isImageFile(file.name)) {
            try {

                const originalSize = await getFileSize(file.name);
                if (originalSize < 1024 * 1024) {
                    console.log(`Skipping ${file.name} as it is less than 1MB.`);
                    continue
                }

                await compressAndUploadImage(file.name).then(async (_) => {

                    // Get size of compressed image
                    const compressedSize = await getFileSize('compressed_' + file.name);

                    // Calculate memory saved
                    const memorySaved = originalSize - compressedSize;

                    if (memorySaved > 100 * 1024) { // 100KB in bytes

                        // Delete original image file
                        totalSaved += memorySaved;
                        console.log(`Compressed ${file.name}, Memory saved: ${memorySaved / 1024} kbs`);

                        await storage.bucket(bucketName).file(file.name).delete();

                        // // Rename compressed image file to original name
                        const compressedFileName = 'compressed_' + file.name;

                        const newFileName = file.name;
                        await storage.bucket(bucketName).file(compressedFileName).move(newFileName);
                    } else {
                        // Delete the compressed file if memory saved is not significant
                        await storage.bucket(bucketName).file('compressed_' + file.name).delete();
                        console.log(`Compression skipped for ${file.name}. Memory saved is less than 100KB.`);
                    }
                })
            } catch (error) {
                console.error(`Error processing image file: ${file.name}`, error);
            }

        } else {
            console.log(`Skipping non-image file: ${file.name}`);
        }
        console.log(`Total memory saved: ${totalSaved / 1024} kbs`);
    }

    // Access the folders

}
async function deleteAllFiles() {

    const [files] = await bucket.getFiles();
    for (const file of files) {
        try {
            await storage.bucket(bucketName).file(file.name).delete();
            console.log(`Deleted ${file.name}`);
        } catch (error) {
            console.error(`Error deleting image file: ${file.name}`, error);
        }

    }

}
deleteAllFiles()