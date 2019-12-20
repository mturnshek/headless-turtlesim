const ros = require("rosnodejs");
const { createCanvas, loadImage } = require("canvas");
const { atob } = require("abab");

const poseRange = 11.1; // turtlesim constant
const CompressedImage = "sensor_msgs/CompressedImage";
const Bool = "std_msgs/Bool";
const Twist = "geometry_msgs/Twist";

const drawBackground = (context, canvas, trail) => {
    context.save();
    context.globalAlpha = trail ? 0.12 : 1.0;
    context.fillStyle = "black";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
};

const drawTurtle = (context, image, cx, cy, theta) => {
    context.save();
    context.globalAlpha = 1.0;
    context.translate(cx, cy);
    context.rotate(Math.PI / 2 - theta);
    context.drawImage(
        image,
        -image.width / 2,
        -image.height / 2,
        (width = image.width),
        (height = image.height)
    );
    context.restore();
};

const drawMessage = context => {
    context.save();
    context.fillStyle = "white";
    context.fillText(
        "\u{30C1}\u{30BD}\u{30B2}\u{30BD} \u{30C8}\u{30C3}\u{30D1}",
        cx - 34,
        cy - 30
    );
    context.restore();
};

const getTranslatedCoordinates = (canvas, x, y) => {
    const cx = Math.floor((x * canvas.width) / poseRange);
    const cy = Math.floor(canvas.height - (canvas.height * y) / poseRange);
    return { cx, cy };
};

const getBuffer = canvas => {
    const dataUrl = canvas.toDataURL();
    const base64 = dataUrl.split("base64,")[1];
    return atob(base64)
        .split("")
        .map(_ => _.charCodeAt(0));
};

const generateCompressedImage = canvas => {
    return {
        header: {
            seq: 0,
            stamp: Date.now(),
            frame_id: ""
        },
        format: "png",
        data: getBuffer(canvas)
    };
};

const generateTwist = (linearX, angularZ) => {
    return {
        linear: {
            x: linearX,
            y: 0,
            z: 0
        },
        angular: {
            x: 0,
            y: 0,
            z: angularZ
        }
    };
};

const run = async () => {
    // Set up ROS node and publishers
    await ros.initNode("/headless_turtlesim");
    const node = ros.nh;
    const compressedImagePublisher = node.advertise("/image", CompressedImage);
    const northEastQuadrantPublisher = node.advertise("/northeast_quad", Bool);
    const southWestQuadrantPublisher = node.advertise("/southwest_quad", Bool);
    const commandVelocityPublisher = node.advertise("/turtle1/cmd_vel", Twist);

    // Publish a boolean true or false conditional on if the turtle is in SW or NE quadrants.
    const handleQuadrantIndicators = pose => {
        pose.x > poseRange / 2 && pose.y > poseRange / 2
            ? northEastQuadrantPublisher.publish({ data: true })
            : northEastQuadrantPublisher.publish({ data: false });
        pose.x < poseRange / 2 && pose.y < poseRange / 2
            ? southWestQuadrantPublisher.publish({ data: true })
            : southWestQuadrantPublisher.publish({ data: false });
    };

    // Render and publish a compressed image representing the map and turtle.
    let trail = false; // if on, the turtle leaves a glowing trail in its wake.
    const turtleImage = await loadImage("lunar.png");
    const canvas = createCanvas(640, 640);
    const context = canvas.getContext("2d");
    const renderAndPublishCompressedImage = pose => {
        const { cx, cy } = getTranslatedCoordinates(canvas, pose.x, pose.y);
        drawBackground(context, canvas, trail);
        drawTurtle(context, turtleImage, cx, cy, pose.theta);
        messageOn ? drawMessage() : false;
        compressedImagePublisher.publish(generateCompressedImage(canvas));
    };

    // Respond to a pose from turtlesim_node.
    const handlePose = pose => {
        renderAndPublishCompressedImage(pose);
        handleQuadrantIndicators(pose);
    };

    // Make the turtle spin.
    let spin = false;
    let spinCount = 0;
    const maxSpinCount = 4000;
    const spinterval = 50; // maxSpinCount * spinterval is total turtle spin duration
    let [linearX, angularZ] = [0.0, 0.0];
    const [dLinearX, dAngularZ] = [0.01, 0.022]; // acceleration, the ratio controls the circle's radius
    let messageOn = false;
    const messageUptime = 3000;
    setInterval(() => {
        if (spin) {
            if (spinCount < maxSpinCount) {
                linearX += dLinearX;
                angularZ += dAngularZ;
            } else {
                spin = false;
                messageOn = true;
                setTimeout(() => (messageOn = false), messageUptime);
            }
            commandVelocityPublisher.publish(generateTwist(linearX, angularZ));
            spinCount += 1;
        } else {
            linearX = 0.0;
            angularZ = 0.0;
            spinCount = 0;
        }
    }, spinterval);

    node.subscribe("/turtle1/pose", "turtlesim/Pose", pose => handlePose(pose));
    node.subscribe("/spin_on", "std_msgs/Bool", _ => (spin = true));
    node.subscribe("/spin_off", "std_msgs/Bool", _ => (spin = false));
    node.subscribe("/trail_on", "std_msgs/Bool", _ => (trail = true));
    node.subscribe("/trail_off", "std_msgs/Bool", _ => (trail = false));
};

(async () => {
    try {
        run();
    } catch (e) {
        console.log(e);
    }
})();
