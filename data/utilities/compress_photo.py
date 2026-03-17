from PIL import Image

MAX_X, MAX_Y = 500, 500

VERY_BIG_X, VERY_BIG_Y = 2000, 2000


def compress_photo(path: str) -> None:
    image = Image.open(path)
    image_size = image.size

    if image_size[0] > VERY_BIG_X or image_size[1] > VERY_BIG_Y:
        a, b = int(0.2 * image_size[0]), int(0.2 * image_size[1])
        result = image.resize((a, b))
        result.save(path)
    elif image_size[0] > VERY_BIG_X or image_size[1] > VERY_BIG_Y:
        a, b = int(0.5 * image_size[0]), int(0.5 * image_size[1])
        result = image.resize((a, b))
        result.save(path)
