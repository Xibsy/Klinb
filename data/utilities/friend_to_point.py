def friend_to_point(friend):
    return {
        'pos': list(map(float, friend.geo_position.split(','))),
        'name': friend.name,
        'avatar': friend.avatar,
    }