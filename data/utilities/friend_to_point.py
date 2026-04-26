def friend_to_point(friend) -> dict | None:
    try:
        point = {
        'pos': list(map(float, friend.geo_position.split(','))),
        'name': friend.name,
        'avatar': friend.avatar,
        }
        return point
    except AttributeError:
        return None

